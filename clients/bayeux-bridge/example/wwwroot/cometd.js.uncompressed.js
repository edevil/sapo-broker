/*
	Copyright (c) 2004-2009, The Dojo Foundation All Rights Reserved.
	Available via Academic Free License >= 2.1 OR the modified BSD license.
	see: http://dojotoolkit.org/license for details
*/

/*
	This is a compiled version of Dojo, built for deployment and not for
	development. To get an editable version, please visit:

		http://dojotoolkit.org

	for documentation and information on getting the source.
*/

if(!dojo._hasResource["dojo.AdapterRegistry"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["dojo.AdapterRegistry"] = true;
dojo.provide("dojo.AdapterRegistry");

dojo.AdapterRegistry = function(/*Boolean?*/ returnWrappers){
	//	summary:
	//		A registry to make contextual calling/searching easier.
	//	description:
	//		Objects of this class keep list of arrays in the form [name, check,
	//		wrap, directReturn] that are used to determine what the contextual
	//		result of a set of checked arguments is. All check/wrap functions
	//		in this registry should be of the same arity.
	//	example:
	//	|	// create a new registry
	//	|	var reg = new dojo.AdapterRegistry();
	//	|	reg.register("handleString",
	//	|		dojo.isString,
	//	|		function(str){
	//	|			// do something with the string here
	//	|		}
	//	|	);
	//	|	reg.register("handleArr",
	//	|		dojo.isArray,
	//	|		function(arr){
	//	|			// do something with the array here
	//	|		}
	//	|	);
	//	|
	//	|	// now we can pass reg.match() *either* an array or a string and
	//	|	// the value we pass will get handled by the right function
	//	|	reg.match("someValue"); // will call the first function
	//	|	reg.match(["someValue"]); // will call the second

	this.pairs = [];
	this.returnWrappers = returnWrappers || false; // Boolean
}

dojo.extend(dojo.AdapterRegistry, {
	register: function(/*String*/ name, /*Function*/ check, /*Function*/ wrap, /*Boolean?*/ directReturn, /*Boolean?*/ override){
		//	summary: 
		//		register a check function to determine if the wrap function or
		//		object gets selected
		//	name:
		//		a way to identify this matcher.
		//	check:
		//		a function that arguments are passed to from the adapter's
		//		match() function.  The check function should return true if the
		//		given arguments are appropriate for the wrap function.
		//	directReturn:
		//		If directReturn is true, the value passed in for wrap will be
		//		returned instead of being called. Alternately, the
		//		AdapterRegistry can be set globally to "return not call" using
		//		the returnWrappers property. Either way, this behavior allows
		//		the registry to act as a "search" function instead of a
		//		function interception library.
		//	override:
		//		If override is given and true, the check function will be given
		//		highest priority. Otherwise, it will be the lowest priority
		//		adapter.
		this.pairs[((override) ? "unshift" : "push")]([name, check, wrap, directReturn]);
	},

	match: function(/* ... */){
		// summary:
		//		Find an adapter for the given arguments. If no suitable adapter
		//		is found, throws an exception. match() accepts any number of
		//		arguments, all of which are passed to all matching functions
		//		from the registered pairs.
		for(var i = 0; i < this.pairs.length; i++){
			var pair = this.pairs[i];
			if(pair[1].apply(this, arguments)){
				if((pair[3])||(this.returnWrappers)){
					return pair[2];
				}else{
					return pair[2].apply(this, arguments);
				}
			}
		}
		throw new Error("No match found");
	},

	unregister: function(name){
		// summary: Remove a named adapter from the registry

		// FIXME: this is kind of a dumb way to handle this. On a large
		// registry this will be slow-ish and we can use the name as a lookup
		// should we choose to trade memory for speed.
		for(var i = 0; i < this.pairs.length; i++){
			var pair = this.pairs[i];
			if(pair[0] == name){
				this.pairs.splice(i, 1);
				return true;
			}
		}
		return false;
	}
});

}

if(!dojo._hasResource["dojox.cometd._base"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["dojox.cometd._base"] = true;
dojo.provide("dojox.cometd._base");



/*
 * this file defines Comet protocol client. Actual message transport is
 * deferred to one of several connection type implementations. The default is a
 * long-polling implementation. A single global object named "dojox.cometd" is
 * used to mediate for these connection types in order to provide a stable
 * interface.
 *
 * extensions modules may be loaded (eg "dojox.cometd.timestamp", that use
 * the cometd._extendInList and cometd._extendOutList fields to provide functions
 * that extend and handling incoming and outgoing messages.
 * 
 * By default the long-polling and callback-polling transports will be required.
 * If specific or alternative transports are required, then they can be directly 
 * loaded. For example 
 * will load cometd with only the json encoded variant of the long polling transport.
 */

dojox.cometd = {
	Connection: function(prefix){ // This constructor is stored as dojox.cometd.Connection
		// summary
		// This constructor is used to create new cometd connections. Generally, you should use
		// one cometd connection for each server you connect to. A default connection instance is 
		// created at dojox.cometd.
		// To connect to a new server you can create an instance like:
		// var cometd = new dojox.cometd.Connection("/otherServer");
		// cometd.init("http://otherServer.com/cometd");
		//
		// prefix is the prefix for all the events that are published in the Dojo pub/sub system.
		// You must include this prefix, and it should start with a slash like "/myprefix".
		
		// cometd states:
		// unconnected, handshaking, connecting, connected, disconnected
		dojo.mixin(this, {
		prefix: prefix,
			_status: "unconnected",
			_handshook: false,
			_initialized: false,
			_polling: false,
		
			expectedNetworkDelay: 10000, // expected max network delay
			connectTimeout: 0,		 // If set, used as ms to wait for a connect response and sent as the advised timeout
		
			version:	"1.0",
			minimumVersion: "0.9",
			clientId: null,
			messageId: 0,
			batch: 0,
		
			_isXD: false,
			handshakeReturn: null,
			currentTransport: null,
			url: null,
			lastMessage: null,
			_messageQ: [],
			handleAs: "json",
			_advice: {},
			_backoffInterval: 0,
			_backoffIncrement: 1000,
			_backoffMax: 60000,
			_deferredSubscribes: {},
			_deferredUnsubscribes: {},
			_subscriptions: [],
			_extendInList: [],	// List of functions invoked before delivering messages
			_extendOutList: []	// List of functions invoked before sending messages
			
		});
	
		this.state = function() {
			 return this._status;
		}
	
		this.init = function(	/*String*/	root,
					/*Object?*/ props,
					/*Object?*/ bargs){	// return: dojo.Deferred
			//	summary:
			//		Initialize the cometd implementation of the Bayeux protocol
			//	description:
			//		Initialize the cometd implementation of the Bayeux protocol by
			//		sending a handshake message. The cometd state will be changed to CONNECTING
			//		until a handshake response is received and the first successful connect message
			//		has returned.
			//		The protocol state changes may be monitored
			//		by subscribing to the dojo topic "/prefix/meta" (typically "/cometd/meta") where 
			//		events are published in the form 
			//		   {cometd:this,action:"handshake",successful:true,state:this.state()}
			//	root:
			//		The URL of the cometd server. If the root is absolute, the host
			//		is examined to determine if xd transport is needed. Otherwise the
			//		same domain is assumed.
			//	props:
			//		An optional object that is used as the basis of the handshake message
			//	bargs:
			//		An optional object of bind args mixed in with the send of the handshake
			//	example:
			//	|	dojox.cometd.init("/cometd");
			//	|	dojox.cometd.init("http://xdHost/cometd",{ext:{user:"fred",pwd:"secret"}});
	
			// FIXME: if the root isn't from the same host, we should automatically
			// try to select an XD-capable transport
			props = props || {};
			// go ask the short bus server what we can support
			props.version = this.version;
			props.minimumVersion = this.minimumVersion;
			props.channel = "/meta/handshake";
			props.id = "" + this.messageId++;
	
			this.url = root || dojo.config["cometdRoot"];
			if(!this.url){
				throw "no cometd root";
				return null;
			}
	
			// Are we x-domain? borrowed from dojo.uri.Uri in lieu of fixed host and port properties
			var regexp = "^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?$";
			var parts = ("" + window.location).match(new RegExp(regexp));
			if(parts[4]){
				var tmp = parts[4].split(":");
				var thisHost = tmp[0];
				var thisPort = tmp[1]||"80"; // FIXME: match 443
	
				parts = this.url.match(new RegExp(regexp));
				if(parts[4]){
					tmp = parts[4].split(":");
					var urlHost = tmp[0];
					var urlPort = tmp[1]||"80";
					this._isXD = ((urlHost != thisHost)||(urlPort != thisPort));
				}
			}
	
			if(!this._isXD){
				props.supportedConnectionTypes = dojo.map(dojox.cometd.connectionTypes.pairs, "return item[0]");
			}
	
			props = this._extendOut(props);
	
			var bindArgs = {
				url: this.url,
				handleAs: this.handleAs,
				content: { "message": dojo.toJson([props]) },
				load: dojo.hitch(this,function(msg){
					this._backon();
					this._finishInit(msg);
				}),
				error: dojo.hitch(this,function(e){
					this._backoff();
					this._finishInit(e);
				}),
				timeout: this.expectedNetworkDelay
			};
	
			if(bargs){
				dojo.mixin(bindArgs, bargs);
			}
			this._props = props;
			for(var tname in this._subscriptions){
				for(var sub in this._subscriptions[tname]){
					if(this._subscriptions[tname][sub].topic){
						dojo.unsubscribe(this._subscriptions[tname][sub].topic);
					}
				}
			}
			this._messageQ = [];
			this._subscriptions = [];
			this._initialized = true;
			this._status = "handshaking";
			this.batch = 0;
			this.startBatch();
			
			var r;
			// if xdomain, then we assume jsonp for handshake
			if(this._isXD){
				bindArgs.callbackParamName = "jsonp";
				r = dojo.io.script.get(bindArgs);
			}else{
				r = dojo.xhrPost(bindArgs);
			}
			return r;
		}
		
		this.publish = function(/*String*/ channel, /*Object*/ data, /*Object?*/ props){
			// summary:
			//		publishes the passed message to the cometd server for delivery
			//		on the specified topic
			// channel:
			//		the destination channel for the message
			// data:
			//		a JSON object containing the message "payload"
			// properties:
			//		Optional. Other meta-data to be mixed into the top-level of the
			//		message
			var message = {
				data: data,
				channel: channel
			};
			if(props){
				dojo.mixin(message, props);
			}
			this._sendMessage(message);
		}
	
		
		this.subscribe = function(	/*String */	channel,
						/*Object */	objOrFunc,
						/*String */	funcName,
						/*Object?*/ props){ // return: dojo.Deferred
			//	summary:
			//		inform the server of this client's interest in channel
			//	description:
			//		`dojox.cometd.subscribe()` handles all the hard work of telling
			//		the server that we want to be notified when events are
			//		published on a particular topic. `subscribe` accepts a function
			//		to handle messages and returns a `dojo.Deferred` object which
			//		has an extra property added to it which makes it suitable for
			//		passing to `dojox.cometd.unsubscribe()` as a "subscription
			//		handle" (much like the handle object that `dojo.connect()`
			//		produces and which `dojo.disconnect()` expects).
			//		
			//		Note that of a subscription is registered before a connection
			//		with the server is established, events sent before the
			//		connection is established will not be delivered to this client.
			//		The deferred object which `subscribe` returns will callback
			//		when the server successfuly acknolwedges receipt of our
			//		"subscribe" request.
			//	channel:
			//		name of the cometd channel to subscribe to
			//	objOrFunc:
			//		an object scope for funcName or the name or reference to a
			//		function to be called when messages are delivered to the
			//		channel
			//	funcName:
			//		the second half of the objOrFunc/funcName pair for identifying
			//		a callback function to notifiy upon channel message delivery
			//	example:
			//		Simple subscribe use-case
			//	|	dojox.cometd.init("http://myserver.com:8080/cometd");
			//	|	// log out all incoming messages on /foo/bar
			//	|	dojox.cometd.subscribe("/foo/bar", console, "debug");
			//	example:
			//		Subscribe before connection is initialized
			//	|	dojox.cometd.subscribe("/foo/bar", console, "debug");
			//	|	dojox.cometd.init("http://myserver.com:8080/cometd");
			//	example:
			//		Subscribe an unsubscribe
			//	|	dojox.cometd.init("http://myserver.com:8080/cometd");
			//	|	var h = dojox.cometd.subscribe("/foo/bar", console, "debug");
			//	|	dojox.cometd.unsubscribe(h);
			//	example:
			//		Listen for successful subscription:
			//	|	dojox.cometd.init("http://myserver.com:8080/cometd");
			//	|	var h = dojox.cometd.subscribe("/foo/bar", console, "debug");
			//	|	h.addCallback(function(){
			//	|		console.debug("subscription to /foo/bar established");
			//	|	});
	
			props = props||{};
			if(objOrFunc){
				var tname = prefix + channel;
				var subs = this._subscriptions[tname];
				if(!subs || subs.length == 0){
					subs = [];
					props.channel = "/meta/subscribe";
					props.subscription = channel;
					this._sendMessage(props);
					
					var _ds = this._deferredSubscribes;
					if(_ds[channel]){
						_ds[channel].cancel();
						delete _ds[channel];
					}
					_ds[channel] = new dojo.Deferred();
				}
				
				for(var i in subs){
					if(subs[i].objOrFunc === objOrFunc && (!subs[i].funcName&&!funcName||subs[i].funcName==funcName) ){
						return null;
					}
				}
				
				var topic = dojo.subscribe(tname, objOrFunc, funcName);
				subs.push({ 
					topic: topic, 
					objOrFunc: objOrFunc, 
					funcName: funcName
				});
				this._subscriptions[tname] = subs;
			}
			var ret = this._deferredSubscribes[channel] || {};
			ret.args = dojo._toArray(arguments);
			return ret; // dojo.Deferred
		}
	
		this.unsubscribe = function(	/*String*/	channel,
						/*Object?*/ objOrFunc,
						/*String?*/ funcName,
						/*Object?*/ props){
			// summary:
			//		inform the server of this client's disinterest in channel
			// channel:
			//		name of the cometd channel to unsubscribe from
			// objOrFunc:
			//		an object scope for funcName or the name or reference to a
			//		function to be called when messages are delivered to the
			//		channel. If null then all subscribers to the channel are unsubscribed.
			// funcName:
			//		the second half of the objOrFunc/funcName pair for identifying
			//		a callback function to notifiy upon channel message delivery
	
			if(
				(arguments.length == 1) &&
				(!dojo.isString(channel)) &&
				(channel.args)
			){
				// it's a subscription handle, unroll
				return this.unsubscribe.apply(this, channel.args);
			}
			
			var tname = prefix + channel;
			var subs = this._subscriptions[tname];
			if(!subs || subs.length==0){
				return null;
			}
	
			var s=0;
			for(var i in subs){
				var sb = subs[i];
				if((!objOrFunc) ||
					(
						sb.objOrFunc===objOrFunc &&
						(!sb.funcName && !funcName || sb.funcName==funcName)
					)
				){
					dojo.unsubscribe(subs[i].topic);
					delete subs[i];
				}else{
					s++;
				}
			}
			
			if(s == 0){
				props = props || {};
				props.channel = "/meta/unsubscribe";
				props.subscription = channel;
				delete this._subscriptions[tname];
				this._sendMessage(props);
				this._deferredUnsubscribes[channel] = new dojo.Deferred();
				if(this._deferredSubscribes[channel]){
					this._deferredSubscribes[channel].cancel();
					delete this._deferredSubscribes[channel];
				}
			}
			return this._deferredUnsubscribes[channel]; // dojo.Deferred
		}
		
		
		this.disconnect = function(){
			//	summary:
			//		Disconnect from the server.
			//	description:
			//		Disconnect from the server by sending a disconnect message
			//	example:
			//	|	dojox.cometd.disconnect();
	
			for(var tname in this._subscriptions){
				for(var sub in this._subscriptions[tname]){
					if(this._subscriptions[tname][sub].topic){
						dojo.unsubscribe(this._subscriptions[tname][sub].topic);
					}
				}
			}
			this._subscriptions = [];
			this._messageQ = [];
			if(this._initialized && this.currentTransport){
				this._initialized=false;
				this.currentTransport.disconnect();
			}
			if(!this._polling) {
				this._publishMeta("connect",false);
			}
			this._initialized=false;
			this._handshook=false;
			this._status = "disconnected"; //should be disconnecting, but we ignore the reply to this message
			this._publishMeta("disconnect",true);
		}
	
		
		// public extension points
		
		this.subscribed = function(	/*String*/channel, /*Object*/message){ }
	
		this.unsubscribed = function(/*String*/channel, /*Object*/message){ }
	
	
		// private methods (TODO name all with leading _)
	
		this.tunnelInit = function(childLocation, childDomain){
			// placeholder - replaced by _finishInit
		}
		
		this.tunnelCollapse = function(){
			// placeholder - replaced by _finishInit
		}
		
		this._backoff = function(){
			if(!this._advice){
				this._advice={reconnect:"retry",interval:0};
			}else if(!this._advice.interval){
				this._advice.interval = 0;
			}
			
			if(this._backoffInterval < this._backoffMax){
				this._backoffInterval += this._backoffIncrement;
			}
		}
		
		this._backon = function(){
			this._backoffInterval=0;
		}
	
		this._interval = function(){
			var i = this._backoffInterval + (this._advice ? (this._advice.interval ? this._advice.interval : 0) : 0);
			if (i>0){
				console.log("Retry in interval+backoff=" + this._advice.interval + "+" + this._backoffInterval+"="+i+"ms");
			}
			return i;
		}
		
		this._publishMeta = function(action,successful,props){
			try {
				var meta = {cometd:this,action:action,successful:successful,state:this.state()};
				if (props){
					dojo.mixin(meta, props);
				}
				dojo.publish(this.prefix + "/meta", [meta]);
			} catch(e) {
				console.log(e);
			}
		}
	
		this._finishInit = function(data){
			//	summary:
			//		Handle the handshake return from the server and initialize
			//		connection if all is OK

			if(this._status!="handshaking") {return;}


			var wasHandshook = this._handshook;
			var successful = false;	
			var metaMsg = {};

			if (data instanceof Error) {
				dojo.mixin(metaMsg,{
					reestablish:false,
					failure: true,
					error: data,
					advice: this._advice
				});
			} else {
				data = data[0];
				data = this._extendIn(data);
				this.handshakeReturn = data;
				// remember any advice
				if(data["advice"]){
					this._advice = data.advice;
				}

				successful = data.successful ? data.successful : false;

				// check version
				if(data.version < this.minimumVersion){
					if (console.log)
						console.log("cometd protocol version mismatch. We wanted", this.minimumVersion, "but got", data.version);
					successful=false;
					this._advice.reconnect="none";
				}
				dojo.mixin(metaMsg,{reestablish: successful && wasHandshook, response:data});
			} 

			this._publishMeta("handshake",successful,metaMsg);
			//in the meta listeners, disconnect() may have been called, so recheck it now to 
			//prevent resends or continuing with initializing the protocol
			if(this._status!="handshaking") {return;}

			// If all OK
			if(successful){
				this._status = "connecting";
				this._handshook = true;
				// pick a transport
				this.currentTransport = dojox.cometd.connectionTypes.match(
					data.supportedConnectionTypes,
					data.version,
					this._isXD
				);
				var transport = this.currentTransport;
				// initialize the transport
				transport._cometd = this;
				transport.version = data.version;
				this.clientId = data.clientId;
				this.tunnelInit = transport.tunnelInit && dojo.hitch(transport, "tunnelInit");
				this.tunnelCollapse = transport.tunnelCollapse && dojo.hitch(transport, "tunnelCollapse");
				transport.startup(data);
			}else{
				// If there is a problem follow advice
				if(!this._advice || this._advice["reconnect"] != "none"){
					setTimeout(dojo.hitch(this, "init", this.url, this._props), this._interval());
				}
			}
		}
	
		// FIXME: lots of repeated code...why?
		this._extendIn = function(message){
			// summary: Handle extensions for inbound messages
			dojo.forEach(dojox.cometd._extendInList, function(f){
				message = f(message) || message;
			});
			return message;
		}
	
		this._extendOut = function(message){
			// summary: Handle extensions for inbound messages
			dojo.forEach(dojox.cometd._extendOutList, function(f){
				message = f(message) || message;
			});
			return message;
		}
	
		this.deliver = function(messages){
			dojo.forEach(messages, this._deliver, this);
			return messages;
		}
	
		this._deliver = function(message){
			// dipatch events along the specified path
			
			message = this._extendIn(message);
	
			if(!message["channel"]){
				if(message["success"] !== true){
					return;
				}
			}
			this.lastMessage = message;
	
			if(message.advice){
				this._advice = message.advice; // TODO maybe merge?
			}
	
			// check to see if we got a /meta channel message that we care about
			var deferred=null;
			if(	(message["channel"]) &&
				(message.channel.length > 5) &&
				(message.channel.substr(0, 5) == "/meta")){
				// check for various meta topic actions that we need to respond to
				switch(message.channel){
					case "/meta/connect":
						var metaMsg = {response: message};
						if(message.successful) {
							if (this._status != "connected"){
								this._status = "connected";
								this.endBatch();
							}
						}
 
						if(this._initialized){
							this._publishMeta("connect",message.successful, metaMsg);
						}
						break;
					case "/meta/subscribe":
						deferred = this._deferredSubscribes[message.subscription];
						try
						{
							if(!message.successful){
								if(deferred){
									deferred.errback(new Error(message.error));
								}
								this.currentTransport.cancelConnect();
								return;
							}
							if(deferred){
								deferred.callback(true);
							}
							this.subscribed(message.subscription, message);
						} catch(e)	{
							log.warn(e);
						}
						break;
					case "/meta/unsubscribe":
						deferred = this._deferredUnsubscribes[message.subscription];
						try
						{
							if(!message.successful){
								if(deferred){
									deferred.errback(new Error(message.error));
								}
								this.currentTransport.cancelConnect();
								return;
							}
							if(deferred){
								deferred.callback(true);
							}
							this.unsubscribed(message.subscription, message);
						} catch(e)	{
							log.warn(e);
						}
						break;
					default:
						if(message.successful && !message.successful){
							this.currentTransport.cancelConnect();
							return;
						}
				}
			}
			
			// send the message down for processing by the transport
			this.currentTransport.deliver(message);
	
			if(message.data){
				// dispatch the message to any locally subscribed listeners
				try{
					var messages = [message];
	
					// Determine target topic
					var tname = prefix + message.channel;
	
					// Deliver to globs that apply to target topic
					var tnameParts = message.channel.split("/");
					var tnameGlob = prefix;
					for (var i = 1; i < tnameParts.length - 1; i++){
						dojo.publish(tnameGlob + "/**", messages);
						tnameGlob += "/" + tnameParts[i];
					}
					dojo.publish(tnameGlob + "/**", messages);
					dojo.publish(tnameGlob + "/*", messages);
		
					// deliver to target topic
					dojo.publish(tname,messages);
				}catch(e){
					console.log(e);
				}
			}
		}
	
		this._sendMessage = function(/* object */ message){
			if(this.currentTransport && !this.batch){
				return this.currentTransport.sendMessages([message]);
			}else{
				this._messageQ.push(message);
				return null;
			}
		}
	
		this.startBatch = function(){
			this.batch++;
		}
	
		this.endBatch = function(){
			if(--this.batch <= 0 && this.currentTransport && this._status == "connected"){
				this.batch = 0;
				var messages = this._messageQ;
				this._messageQ = [];
				if(messages.length > 0){
					this.currentTransport.sendMessages(messages);
				}
			}
		}
		
		this._onUnload = function(){
			// make this the last of the onUnload method
			dojo.addOnUnload(dojox.cometd, "disconnect");
		}
	
		this._connectTimeout = function(){
			// summary: Return the connect timeout in ms, calculated as the minimum of the advised timeout
			// and the configured timeout. Else 0 to indicate no client side timeout
			var advised=0;
			if(this._advice && this._advice.timeout && this.expectedNetworkDelay > 0){
				advised = this._advice.timeout + this.expectedNetworkDelay;
			}
			
			if(this.connectTimeout > 0 && this.connectTimeout < advised){
				return this.connectTimeout;
			}
			
			return advised;
		}
	},
	// connectionTypes are shared by all cometd Connection.
	connectionTypes : new dojo.AdapterRegistry(true)
}

// create the default instance
dojox.cometd.Connection.call(dojox.cometd,"/cometd"); 

/*

FIXME: TODOC: this info should be part of the relevant functions and/or overview so
the parser can find it.

transport objects MUST expose the following methods:
	- check
	- startup
	- sendMessages
	- deliver
	- disconnect
optional, standard but transport dependent methods are:
	- tunnelCollapse
	- tunnelInit

Transports SHOULD be namespaced under the cometd object and transports MUST
register themselves with cometd.connectionTypes

here's a stub transport defintion:

cometd.blahTransport = new function(){
	this._connectionType="my-polling";
	this._cometd=null;
	this.lastTimestamp = null;

	this.check = function(types, version, xdomain){
		// summary:
		//		determines whether or not this transport is suitable given a
		//		list of transport types that the server supports
		return dojo.inArray(types, "blah");
	}

	this.startup = function(){
		if(dojox.cometd._polling){ return; }
		// FIXME: fill in startup routine here
		dojox.cometd._polling = true;
	}

	this.sendMessages = function(message){
		// FIXME: fill in message array sending logic
	}

	this.deliver = function(message){
	}

	this.disconnect = function(){
		// send orderly disconnect message
	}

	this.cancelConnect = function(){
		// cancel the current connection
	}
}
cometd.connectionTypes.register("blah", cometd.blahTransport.check, cometd.blahTransport);
*/

dojo.addOnUnload(dojox.cometd, "_onUnload");

}

if(!dojo._hasResource["dojox.cometd.longPollTransportJsonEncoded"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["dojox.cometd.longPollTransportJsonEncoded"] = true;
dojo.provide("dojox.cometd.longPollTransportJsonEncoded");


dojox.cometd.longPollTransportJsonEncoded = new function(){
	// This is an alternative implementation to that provided in logPollTransportFormEncoded.js 
	// that sends messages as text/json rather than form encoding them. 
	
	this._connectionType="long-polling";
	this._cometd=null;

	this.check = function(types, version, xdomain){
		return ((!xdomain)&&(dojo.indexOf(types, "long-polling") >= 0));
	}

	this.tunnelInit = function(){
		var message = {
			channel:	"/meta/connect",
			clientId:	this._cometd.clientId,
			connectionType: this._connectionType,
			id:	""+this._cometd.messageId++
		};
		message=this._cometd._extendOut(message);
		this.openTunnelWith([message]);
	}

	this.tunnelCollapse = function(){
		// TODO handle transport specific advice
		
		if(!this._cometd._initialized){ return; }
			
		if(this._cometd._advice && this._cometd._advice["reconnect"]=="none"){
			return;
		}
		if (this._cometd._status=="connected") {
			setTimeout(dojo.hitch(this,function(){this._connect();}),this._cometd._interval());
		}else{
			setTimeout(dojo.hitch(this._cometd,function(){this.init(this.url,this._props);}),this._cometd._interval());
		}
	}

	this._connect = function(){
		if(!this._cometd._initialized){ return; }
		if(this._cometd._polling) {
			return;
		}
			
		if((this._cometd._advice) && (this._cometd._advice["reconnect"]=="handshake")){
			this._cometd._status="unconnected";
			this._initialized = false;
			this._cometd.init(this._cometd.url,this._cometd._props);
 		}else if(this._cometd._status=="connected"){
			var message={
				channel:	"/meta/connect",
				connectionType: this._connectionType,
				clientId:	this._cometd.clientId,
				id:	""+this._cometd.messageId++
			};
			if (this._cometd.connectTimeout>=this._cometd.expectedNetworkDelay){
				message.advice={timeout:(this._cometd.connectTimeout-this._cometd.expectedNetworkDelay)};
			}
			message=this._cometd._extendOut(message);
			this.openTunnelWith([message]);
		}
	}

	this.deliver = function(message){
		// Nothing to do
	}

	this.openTunnelWith = function(messages, url){
		this._cometd._polling = true;
		var post = {
			url: (url||this._cometd.url),
			postData: dojo.toJson(messages),
			contentType: "text/json;charset=UTF-8",
			handleAs: this._cometd.handleAs,
			load: dojo.hitch(this, function(data){
				this._cometd._polling=false;
				this._cometd.deliver(data);
				this._cometd._backon();
				this.tunnelCollapse();
			}),
			error: dojo.hitch(this, function(err){
				this._cometd._polling=false;
				var metaMsg = {
					failure: true,
					error: err,
					advice: this._cometd._advice
				};
				this._cometd._publishMeta("connect",false, metaMsg);
				this._cometd._backoff();
				this.tunnelCollapse();
			})
		};

		var connectTimeout=this._cometd._connectTimeout();
		if (connectTimeout>0) {
			post.timeout=connectTimeout;
		}

		this._poll = dojo.rawXhrPost(post);
	}

	this.sendMessages = function(messages){
		for(var i=0; i<messages.length; i++){
			messages[i].clientId = this._cometd.clientId;
			messages[i].id = ""+this._cometd.messageId++;
			messages[i]=this._cometd._extendOut(messages[i]);
		}
		return dojo.rawXhrPost({
			url: this._cometd.url||dojo.config["cometdRoot"],
			handleAs: this._cometd.handleAs,
			load: dojo.hitch(this._cometd, "deliver"),
			postData: dojo.toJson(messages),
			contentType: "text/json;charset=UTF-8",
			error: dojo.hitch(this, function(err){
				this._cometd._publishMeta("publish",false,{messages:messages});
			}),
			timeout: this._cometd.expectedNetworkDelay
		});
	}

	this.startup = function(handshakeData){
		if(this._cometd._status=="connected"){ return; }
		this.tunnelInit();
	}

	this.disconnect = function(){
		var message = {
			channel: "/meta/disconnect",
			clientId: this._cometd.clientId,
			id:	"" + this._cometd.messageId++
		};
		message = this._cometd._extendOut(message);
		dojo.rawXhrPost({
			url: this._cometd.url || dojo.config["cometdRoot"],
			handleAs: this._cometd.handleAs,
			postData: dojo.toJson([message]),
			contentType: "text/json;charset=UTF-8"
		});
	}

	this.cancelConnect = function(){
		if(this._poll){
			this._poll.cancel();
			this._cometd._polling=false;
			this._cometd._publishMeta("connect",false,{cancel:true});
			this._cometd._backoff();
			this.disconnect();
			this.tunnelCollapse();
		}
	}
}

dojox.cometd.longPollTransport = dojox.cometd.longPollTransportJsonEncoded;

dojox.cometd.connectionTypes.register("long-polling", dojox.cometd.longPollTransport.check, dojox.cometd.longPollTransportJsonEncoded);
dojox.cometd.connectionTypes.register("long-polling-json-encoded", dojox.cometd.longPollTransport.check, dojox.cometd.longPollTransportJsonEncoded);


}

if(!dojo._hasResource["dojox.cometd.longPollTransport"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["dojox.cometd.longPollTransport"] = true;
dojo.provide("dojox.cometd.longPollTransport");


}

if(!dojo._hasResource["dojo.io.script"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["dojo.io.script"] = true;
dojo.provide("dojo.io.script");

/*=====
dojo.declare("dojo.io.script.__ioArgs", dojo.__IoArgs, {
	constructor: function(){
		//	summary:
		//		All the properties described in the dojo.__ioArgs type, apply to this
		//		type as well, EXCEPT "handleAs". It is not applicable to
		//		dojo.io.script.get() calls, since it is implied by the usage of
		//		"jsonp" (response will be a JSONP call returning JSON)
		//		or the response is pure JavaScript defined in
		//		the body of the script that was attached.
		//	callbackParamName: String
		//		Deprecated as of Dojo 1.4 in favor of "jsonp", but still supported for
		// 		legacy code. See notes for jsonp property.
		//	jsonp: String
		//		The URL parameter name that indicates the JSONP callback string.
		//		For instance, when using Yahoo JSONP calls it is normally, 
		//		jsonp: "callback". For AOL JSONP calls it is normally 
		//		jsonp: "c".
		//	checkString: String
		//		A string of JavaScript that when evaluated like so: 
		//		"typeof(" + checkString + ") != 'undefined'"
		//		being true means that the script fetched has been loaded. 
		//		Do not use this if doing a JSONP type of call (use callbackParamName instead).
		//	frameDoc: Document
		//		The Document object for a child iframe. If this is passed in, the script
		//		will be attached to that document. This can be helpful in some comet long-polling
		//		scenarios with Firefox and Opera.
		this.callbackParamName = callbackParamName;
		this.jsonp = jsonp;
		this.checkString = checkString;
		this.frameDoc = frameDoc;
	}
});
=====*/
;(function(){
	var loadEvent = dojo.isIE ? "onreadystatechange" : "load",
		readyRegExp = /complete|loaded/;

	dojo.io.script = {
		get: function(/*dojo.io.script.__ioArgs*/args){
			//	summary:
			//		sends a get request using a dynamically created script tag.
			var dfd = this._makeScriptDeferred(args);
			var ioArgs = dfd.ioArgs;
			dojo._ioAddQueryToUrl(ioArgs);
	
			dojo._ioNotifyStart(dfd);

			if(this._canAttach(ioArgs)){
				var node = this.attach(ioArgs.id, ioArgs.url, args.frameDoc);

				//If not a jsonp callback or a polling checkString case, bind
				//to load event on the script tag.
				if(!ioArgs.jsonp && !ioArgs.args.checkString){
					var handle = dojo.connect(node, loadEvent, function(evt){
						if(evt.type == "load" || readyRegExp.test(node.readyState)){
							dojo.disconnect(handle);
							ioArgs.scriptLoaded = evt;
						}
					});
				}
			}

			dojo._ioWatch(dfd, this._validCheck, this._ioCheck, this._resHandle);
			return dfd;
		},
	
		attach: function(/*String*/id, /*String*/url, /*Document?*/frameDocument){
			//	summary:
			//		creates a new <script> tag pointing to the specified URL and
			//		adds it to the document.
			//	description:
			//		Attaches the script element to the DOM.  Use this method if you
			//		just want to attach a script to the DOM and do not care when or
			//		if it loads.
			var doc = (frameDocument || dojo.doc);
			var element = doc.createElement("script");
			element.type = "text/javascript";
			element.src = url;
			element.id = id;
			element.charset = "utf-8";
			return doc.getElementsByTagName("head")[0].appendChild(element);
		},
	
		remove: function(/*String*/id, /*Document?*/frameDocument){
			//summary: removes the script element with the given id, from the given frameDocument.
			//If no frameDocument is passed, the current document is used.
			dojo.destroy(dojo.byId(id, frameDocument));
			
			//Remove the jsonp callback on dojo.io.script, if it exists.
			if(this["jsonp_" + id]){
				delete this["jsonp_" + id];
			}
		},
	
		_makeScriptDeferred: function(/*Object*/args){
			//summary: 
			//		sets up a Deferred object for an IO request.
			var dfd = dojo._ioSetArgs(args, this._deferredCancel, this._deferredOk, this._deferredError);
	
			var ioArgs = dfd.ioArgs;
			ioArgs.id = dojo._scopeName + "IoScript" + (this._counter++);
			ioArgs.canDelete = false;
	
			//Special setup for jsonp case
			ioArgs.jsonp = args.callbackParamName || args.jsonp;
			if(ioArgs.jsonp){
				//Add the jsonp parameter.
				ioArgs.query = ioArgs.query || "";
				if(ioArgs.query.length > 0){
					ioArgs.query += "&";
				}
				ioArgs.query += ioArgs.jsonp
					+ "="
					+ (args.frameDoc ? "parent." : "")
					+ dojo._scopeName + ".io.script.jsonp_" + ioArgs.id + "._jsonpCallback";
	
				ioArgs.frameDoc = args.frameDoc;
	
				//Setup the Deferred to have the jsonp callback.
				ioArgs.canDelete = true;
				dfd._jsonpCallback = this._jsonpCallback;
				this["jsonp_" + ioArgs.id] = dfd;
			}
			return dfd; // dojo.Deferred
		},
		
		_deferredCancel: function(/*Deferred*/dfd){
			//summary: canceller function for dojo._ioSetArgs call.
	
			//DO NOT use "this" and expect it to be dojo.io.script.
			dfd.canceled = true;
			if(dfd.ioArgs.canDelete){
				dojo.io.script._addDeadScript(dfd.ioArgs);
			}
		},
	
		_deferredOk: function(/*Deferred*/dfd){
			//summary: okHandler function for dojo._ioSetArgs call.
	
			//DO NOT use "this" and expect it to be dojo.io.script.
			var ioArgs = dfd.ioArgs;
	
			//Add script to list of things that can be removed.		
			if(ioArgs.canDelete){
				dojo.io.script._addDeadScript(ioArgs);
			}
	
			//Favor JSONP responses, script load events then lastly ioArgs.
			//The ioArgs are goofy, but cannot return the dfd since that stops
			//the callback chain in Deferred. The return value is not that important
			//in that case, probably a checkString case.
			return ioArgs.json || ioArgs.scriptLoaded || ioArgs;
		},
	
		_deferredError: function(/*Error*/error, /*Deferred*/dfd){
			//summary: errHandler function for dojo._ioSetArgs call.
	
			if(dfd.ioArgs.canDelete){
				//DO NOT use "this" and expect it to be dojo.io.script.
				if(error.dojoType == "timeout"){
					//For timeouts, remove the script element immediately to
					//avoid a response from it coming back later and causing trouble.
					dojo.io.script.remove(dfd.ioArgs.id, dfd.ioArgs.frameDoc);
				}else{
					dojo.io.script._addDeadScript(dfd.ioArgs);
				}
			}
			console.log("dojo.io.script error", error);
			return error;
		},
	
		_deadScripts: [],
		_counter: 1,
	
		_addDeadScript: function(/*Object*/ioArgs){
			//summary: sets up an entry in the deadScripts array.
			dojo.io.script._deadScripts.push({id: ioArgs.id, frameDoc: ioArgs.frameDoc});
			//Being extra paranoid about leaks:
			ioArgs.frameDoc = null;
		},
	
		_validCheck: function(/*Deferred*/dfd){
			//summary: inflight check function to see if dfd is still valid.
	
			//Do script cleanup here. We wait for one inflight pass
			//to make sure we don't get any weird things by trying to remove a script
			//tag that is part of the call chain (IE 6 has been known to
			//crash in that case).
			var _self = dojo.io.script;
			var deadScripts = _self._deadScripts;
			if(deadScripts && deadScripts.length > 0){
				for(var i = 0; i < deadScripts.length; i++){
					//Remove the script tag
					_self.remove(deadScripts[i].id, deadScripts[i].frameDoc);
					deadScripts[i].frameDoc = null;
				}
				dojo.io.script._deadScripts = [];
			}
	
			return true;
		},
	
		_ioCheck: function(/*Deferred*/dfd){
			//summary: inflight check function to see if IO finished.
			var ioArgs = dfd.ioArgs;
			//Check for finished jsonp
			if(ioArgs.json || (ioArgs.scriptLoaded && !ioArgs.args.checkString)){
				return true;
			}
	
			//Check for finished "checkString" case.
			var checkString = ioArgs.args.checkString;
			if(checkString && eval("typeof(" + checkString + ") != 'undefined'")){
				return true;
			}
	
			return false;
		},
	
		_resHandle: function(/*Deferred*/dfd){
			//summary: inflight function to handle a completed response.
			if(dojo.io.script._ioCheck(dfd)){
				dfd.callback(dfd);
			}else{
				//This path should never happen since the only way we can get
				//to _resHandle is if _ioCheck is true.
				dfd.errback(new Error("inconceivable dojo.io.script._resHandle error"));
			}
		},
	
		_canAttach: function(/*Object*/ioArgs){
			//summary: A method that can be overridden by other modules
			//to control when the script attachment occurs.
			return true;
		},
		
		_jsonpCallback: function(/*JSON Object*/json){
			//summary: 
			//		generic handler for jsonp callback. A pointer to this function
			//		is used for all jsonp callbacks.  NOTE: the "this" in this
			//		function will be the Deferred object that represents the script
			//		request.
			this.ioArgs.json = json;
		}
	}
})();

}

if(!dojo._hasResource["dojox.cometd.callbackPollTransport"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["dojox.cometd.callbackPollTransport"] = true;
dojo.provide("dojox.cometd.callbackPollTransport");




dojox.cometd.callbackPollTransport = new function(){

	this._connectionType = "callback-polling";
	this._cometd = null;

	this.check = function(types, version, xdomain){
		// we handle x-domain!
		return (dojo.indexOf(types, "callback-polling") >= 0);
	}

	this.tunnelInit = function(){
		var message = {
			channel:	"/meta/connect",
			clientId:	this._cometd.clientId,
			connectionType: this._connectionType,
			id:	"" + this._cometd.messageId++
		};
		message = this._cometd._extendOut(message);		
		this.openTunnelWith([message]);
	}

	this.tunnelCollapse = dojox.cometd.longPollTransport.tunnelCollapse;
	this._connect = dojox.cometd.longPollTransport._connect;
	this.deliver = dojox.cometd.longPollTransport.deliver;

	this.openTunnelWith = function(content, url){
		this._cometd._polling = true;
		var script = {
			load: dojo.hitch(this, function(data){
				this._cometd._polling=false;
				this._cometd.deliver(data);
				this._cometd._backon();
				this.tunnelCollapse();
			}),
			error: dojo.hitch(this, function(err){
				this._cometd._polling = false;
				this._cometd._publishMeta("connect",false);
				this._cometd._backoff();
				this.tunnelCollapse();
			}),
			url: (url || this._cometd.url),
			content: { message: dojo.toJson(content) },
			callbackParamName: "jsonp"
		};
		var connectTimeout = this._cometd._connectTimeout();
		if(connectTimeout > 0){
			script.timeout=connectTimeout;
		}
		dojo.io.script.get(script);
	}

	this.sendMessages = function(/*array*/ messages){
		for(var i = 0; i < messages.length; i++){
			messages[i].clientId = this._cometd.clientId;
			messages[i].id = ""+this._cometd.messageId++;
			messages[i]=this._cometd._extendOut(messages[i]);
		}

		var bindArgs = {
			url: this._cometd.url || dojo.config["cometdRoot"],
			load: dojo.hitch(this._cometd, "deliver"),
			callbackParamName: "jsonp",
			content: { message: dojo.toJson( messages ) },
			error: dojo.hitch(this, function(err){
				this._cometd._publishMeta("publish",false,{messages:messages});
			}),
			timeout: this._cometd.expectedNetworkDelay
		};
		return dojo.io.script.get(bindArgs);
	}

	this.startup = function(handshakeData){
		if(this._cometd._connected){ return; }
		this.tunnelInit();
	}

	// FIXME: what is this supposed to do? ;)
	this.disconnect = dojox.cometd.longPollTransport.disconnect;	
	this.disconnect = function(){
		var message = {
			channel: "/meta/disconnect",
			clientId: this._cometd.clientId,
			id: "" + this._cometd.messageId++
		};
		message = this._cometd._extendOut(message);		
		dojo.io.script.get({
			url: this._cometd.url || dojo.config["cometdRoot"],
			callbackParamName: "jsonp",
			content: { message: dojo.toJson([message]) }
		});
	}

	this.cancelConnect = function(){}
}

dojox.cometd.connectionTypes.register("callback-polling", dojox.cometd.callbackPollTransport.check, dojox.cometd.callbackPollTransport);


}

if(!dojo._hasResource["dojox.cometd"]){ //_hasResource checks added by build. Do not use _hasResource directly in your code.
dojo._hasResource["dojox.cometd"] = true;
// stub loader for the cometd module since no implementation code is allowed to live in top-level files
dojo.provide("dojox.cometd");




}
