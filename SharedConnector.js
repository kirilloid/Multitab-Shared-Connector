/**
 * @class SharedConnector
 * allows sharing of any kind of connection between several tabs
 * in order to reduce server load per each client
 * could be used not only for networking, but for any kind of object
 * providing discrete string messages not very often
 * interface of such object should consist of 2 functions:
 * @param {function(function(string))} start main [net]working function
 * it gets callback as input and should call it with
 * string whenever new message is received
 * @param {function(string)} onMessage actual callback for message processing
 *
 * real path of execution is
 * # getting data (message) from external source
 * # code in start executes received callback with that message
 * # SharedConnector multiplexes message and broadcast to other tabs
 * # all tabs receive that broadcast and call onMessage
 *
 * we're using localstorage for sharing one queue among all tabs/windows and distributing events
 * if one tab writes something to storage, all others tabs from same origin get 'storage' event fired on their windows
 * the limitation of using localStorage is that message could not be very large (several MB)
 *
 */
Ext.define('ElyGui.util.SharedConnector',
/*_* @lends SharedConnector prototype */ {

    /**
     * flag that this window/tab instance is master
     * if it is == 1, we're the only tab
     * if it is > 1, there're other tabs
     * @field
     * @type {?number}
     */
    leading: null,

    /**
     * unique id, used to distinguish different tabs
     * @field
     * @type {?number}
     */
    id: null,

    /**
     * list of all other tabs. Used to select another leader if current one is closed
     * @field
     * @type {Object.<number,number>}
     */
    slaves: {},

    /**
     * value from SYNCLEAD bus, stored in local var
     * @field
     * @type {number}
     */
    synclead: 0,

    /**
     * requesting interval (in ms), whether there's some tab alive
     * @field
     * @type {number}
     */
    LS_SYNC_T: 30000,

    /**
     * localStorage bus name for leadership negotiations
     * @field
     * @type {string}
     */
    SYNCLEAD:  'synclead',

    /**
     * localStorage bus name for calling-over tabs
     * @field
     * @type {string}
     */
    SYNCLIST:  'synclist',

    /**
     * localStorage bus name for main data transfer
     * @field
     * @type {string}
     */
    SYNCQUEUE: 'syncqueue',

    /**
     * generates unique name
     * @type {number}
     */
    generateName: function () {
        return Math.round(Math.random() * (1e10 - 1)) + 1;
    },

    /**
     * reminds others, that master is still alive
     * @type {number}
     */
    sync: function () {
        localStorage.setItem(this.SYNCLEAD, Date.now());
    },

    /**
     * utiliy method to distinguish tabs and support peaceful leadership transfer
     * @param {number} arg
     * @param {string} prefix
     */
    name: function (arg, prefix) {
        localStorage.setItem(this.SYNCLIST, (prefix || '') + arg);
    },

    /**
     * process all "beaurucreacy" related to becoming master
     * @param {string} others comma separated values
     */
    becomeMaster: function (others) {
        this.sync();
        this.slaves = {};
        this.leading = 1;

        if (typeof others == 'string') {
            others.split(',').slice(1).forEach(function(n) { this.slaves[n] = this.leading++; }, this);
        } else {
            if (others) { this.name(0); } // ask alive tabs to name each other
        }

        var me = this;
        this.start(function (msg) {
            me.onMessage(msg);
            localStorage.setItem(me.SYNCQUEUE, msg);
        }); // start polling
    },

    /**
     * init processing of sync signal
     */
    initSyncLead: function () {
        var me = this;
        this.synclead = parseInt(localStorage.getItem(me.SYNCLEAD), 10) || 0;
        window.addEventListener('storage', function (event) {
            if (event.key != me.SYNCLEAD) { return; }
            me.synclead = parseInt(event.newValue, 10);
            me.leading = 0;
        });
        window.addEventListener('unload', function () {
            if (me.leading) {
                var a = [], k;
                for (k in me.slaves) { a.push(k); }
                if (a.length) {
                    me.name(a, '+');
                    me.leading = 0;
                }
                // just die, the last warrior
            } else {
                me.name(me.id, '-');
            }
        }, false);
        // leadership sync signal
        setInterval(function () {
            if (me.leading >= 1) { me.sync(); }
            if (!me.leading // we're not the leader
            &&  (Date.now() - me.LS_SYNC_T*2 > me.synclead)) { // and current one is dead
                me.becomeMaster(true);
            }
        }, this.LS_SYNC_T);
    },

    /**
     * init naming negotiations
     */
    initNaming: function () {
        var me = this;
        var tryTakeLeadership;
        function listenEcho (event) {
            if (event.key != me.SYNCLEAD) { return; }
            clearTimeout(tryTakeLeadership);
            window.removeEventListener('storage', listenEcho, false);
        }
        window.addEventListener('storage', function (event) {
            if (event.key != me.SYNCLIST) { return; }
            var m = event.newValue.match(/^([!+\-])?(\d*)$/),
                n = m[2];
            switch (m[1]) {
            case '-': // sometab says, it's going out
                delete me.slaves[n];
                me.leading--;
                break;
            case '+':
                // current leader point sometab a new leader
                // 'n' contains comma-separated full list of other ids
                if (!me.leading && me.id == parseInt(n, 10)) { me.becomeMaster(n); }
                // leader said: "decide by yourselvesm who we'll be the king"
                if (!me.leading && n == '') {
                    window.addEventListener('storage', listenEcho, false);
                    tryTakeLeadership = setTimeout(function () {
                        tryTakeLeadership = setTimeout(me.becomeMaster.bind(me), 1000);
                    }, this.id % 1000);
                    // listen to asnwer
                }
                break;
            case '!': // somebody already use this name
                if (!me.leading && n == me.id) { // if it's our name
                    // cry and run away
                    me.name(me.id = me.generateName());
                }
                break;
            default:
                if (me.id == n) { me.name(me.id, '!'); } // this name is already taken
                if (0 == n) {
                    // distribute responses over one second
                    setTimeout(function () { me.name(me.id); }, me.id % 1000);
                }
                if (me.leading) {
                    me.sync(); // remind we're the leader
                    me.slaves[n] = me.leading++;// and write down we have another slave
                }
            }
        }, false);
    },

    /**
     * main initialization method
     * @param {Object.<string,function>} cfg
     *        {function(function(string))} cfg.start runs main networking sequence and provide callback with results
     *        {function(string)} cfg.onMessage main callback for data response processing
     */
    init: function (cfg) {
        this.start = cfg.start;
        this.onMessage = cfg.onMessage;
        // first listen to data bus notifications
        // if we'll take leadership, we'll not receive that data anyway
        var me = this;
        window.addEventListener('storage', function (event) {
            if (event.key != me.SYNCQUEUE) { return; }
            if (me.leading) { return; } // IE fires event even for tab initiated it
            me.onMessage(event.newValue);
        }, false);
        this.initSyncLead();
        this.initNaming();
        this.decideMaster();
    },

    /**
     * decides, whether we would be leader or there's sometab already
     */
    decideMaster: function () {
        var me = this;
        this.leading = 0;
        var fullFillLeadershipRequest;
        // listen to reponse
        function listenEcho (event) {
            if (event.key == me.SYNCLEAD) { // there's a master already
                clearTimeout(fullFillLeadershipRequest);
                window.removeEventListener('storage', listenEcho, false);
            }
        }
        // name ourself
        this.name(this.id = this.generateName());
        // if nobody answer within one second, we are the only leader
        fullFillLeadershipRequest = setTimeout(this.becomeMaster.bind(this), 1000);
        // listen to asnwer
        window.addEventListener('storage', listenEcho, false);
    }

});
