Connector Sharing
=================
This utility allows you to share network connection (or any other string emitter-like object) between several tabs/windows of the browser.

Why I need it?
------------------
Consider you have some site and there's a chat on every page.
Users often opens several tab with the site, but chat is the same for all of them and each takes connection increasing load on server.
You'd like to have only one connection for all tabs / windows and don't want to mess with managing tabs manually.

What API does it have?
----------------------
Implemented as ExtJS4 class, but could be easily ported to plain JavaScript.
It allows sharing of any kind of event emitter (e.g. ajax-polling) between several tabs in order to reduce server load per each client.
Could be used not only for ajax, but for any type of connections with discrete string messages or even heavy computations.
I.e. one can upgrade `WebWorker` to something close to `SharedWebWorker` with that utility.
Interface of event emitter to work with should consist of 2 functions:

 * `start fn(fn(string))` - initializes message processing (e.g. establishes connection), accepts wrapper for onmessage on data emitter, which passes data further to onMessage. Used only by master tab.
    Wrapping is rather thin layer and required for abstraction from sync mechanism
 * `onMessage fn(string)` - actually processes data, which sould be used in emitter's `onmessage` in case of no sharing.


Data flow
---------

 * getting data (message) from external source
 * code in `start` executes received callback with that message
 * `SharedConnector` multiplexes message and broadcasts to other tabs
 * all tabs receive that broadcast and call their `onMessage`


Implementation
--------------
Synchronization between tabs is implemented via `storage` event, which is fired when `localStorage` is updated.
Using SharedWebWorkers looks appealing, but support of that feature is still limited.


Limitations
-----------
* Browser support: all normal desktop.
* Due to numerous bugs in IE9-11 [iframe](http://stackoverflow.com/questions/20565508/how-to-work-around-ie11-localstorage-events-firing-twice-or-not-at-all-in-iframe), [entry size](http://stackoverflow.com/questions/21139931/ie11-doesnt-fire-local-storage-events-when-value-is-too-large), [old value](http://stackoverflow.com/questions/18265394/why-does-internet-explorer-sometimes-trigger-a-local-storage-event-before-the-da) it's better not to use it at all =)
* Mobile browsers may suppress code execution in background tabs => timer values get out of sync.
* Maximum message size: ~2.5M chars
* Same-origin only

