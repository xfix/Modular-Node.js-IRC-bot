tty = require("tty");
os = require("os");
net = require("net");
mc = require("./ModuleContainer.js");

exports.Server = function(serverSettings) {
	this.serverSettings = serverSettings;
	this.address = serverSettings.address;
	this.port = serverSettings.port;

	this.nick = serverSettings.nick;
	this.userName = serverSettings.userName;
	this.realName = serverSettings.realName;
	this.commandPrefix = serverSettings.commandPrefix;

	this.channels = {};

	this.connected = false;

	this.modules = new mc.ModuleContainer(this);

	this.authenticatedUsers = [];

	this.getUserAuthenticated = function(message) {
		if (this.authenticatedUsers.indexOf(message.prefix) != -1)
			return true;
		else
			return false;
	}

	// Connects to the server and starts listening for incoming data.
	this.connect = function()
	{
		//Check that we're not connected
		if(this.connected)
			throw new Error("Connecting to an already connected server");
		
		console.log("Connecting to "+this.address+":"+this.port+"...");

		var self = this;
		
		this.socket = net.createConnection(this.port, this.address);
		this.socket.parent = this;
		this.socket.on("connect", function() { 
			// Line reading below from
			// https://github.com/martynsmith/node-irc/blob/master/lib/irc.js
		
			var buffer = '';
			self.socket.addListener("data", function (chunk)
			{
				buffer += chunk;
				var lines = buffer.split("\r\n");
				buffer = lines.pop();
				lines.forEach(function (line)
				{
					console.log(">> "+line);
					var message = parseMessage(line, false);
					self.gotRawMessage(message);
				});
			});

			self.sendCommand("NICK", self.nick);
			self.sendCommand("USER", self.userName+" "+self.userName+" "+self.address+" :"+self.realName);
		});
		this.connected = true; 
	}

	this.addChannel = function(channel)
	{
		this.channels[channel.channelName] = channel;
	}

	this.gotRawMessage = function(message)
	{
		switch(message.command)
		{
			case "PRIVMSG":
				var channel = this.channels[message.args[0]];
				var text = message.args[1].trim();
				if (channel)
				{
					if (text.indexOf(this.commandPrefix) == 0) {
						cmdString = text.substring(this.commandPrefix.length);
						command = cmdString.split(" ")[0];
						arguments = cmdString.substring(command.length + 1);
						channel.onCommand(message, command, arguments);
					} else
						channel.onMessage(message.nick, text, message);
				} else {
					sText = text.split(" ");
					if (sText[0] == "Authenticate") {
						for (i = 1; i < sText.length; i++)
							sjText = sText[i];
						if (sjText == this.serverSettings.authPassword) {
							this.authenticatedUsers.push(message.prefix);
							this.sendCommand("NOTICE", message.nick + " :Successfully authenticated.");
						}
						else {
							this.sendCommand("NOTICE", message.nick + " :Authentication failed.");
						}
					}

					this.modules.run('onMessage', message.nick, text);
				}
				break;
			case "JOIN":
				var channel = this.channels[message.args[0]];
				if(channel)
					channel.onUserJoin(message.nick);
				break;
			case "PART":
				var channel = this.channels[message.args[0]];
				if(channel)
					channel.onUserLeave(message.nick);
				break;
			//Changed this to 251; it's a safer assumption.
			case "251":
				this.modules.start();
				for(var channel in this.channels)
				{
					this.sendCommand("JOIN", channel);
					this.channels[channel].modules.start();
				}
				break;
			case "PING":
				this.sendCommand("PONG", message.args[0]);
				break;
			case true:
				modules.run(message.command, message);
				break;
			case "433":
				this.nick += "_";
				this.sendCommand("NICK", this.nick);
				this.sendCommand("USER", this.userName+" "+this.userName+" "+this.address+" :"+this.realName);
				break;
		}
	}
	
    this.sendCommand = function(command, args)
    {
		
		//Check all this to avoid hax
		command = command.replace("\n", "");
		command = command.replace("\r", "");
		args = args.replace("\n", "");
		args = args.replace("\r", "");
		
		console.log("<< " + command + " " + args);
    	this.socket.write(command+" "+args+"\r\n");
    }
    
	//TODO: Functions to say stuff, send PMs, maybe more.
	//But we should only add what we need. No bloat :)
	
	this.notice = function(nick, message)
	{
		this.sendCommand("NOTICE", nick+" :"+message);
	}

	/*
	* parseMessage(line, stripColors)
	*
	* takes a raw "line" from the IRC server and turns it into an object with
	* useful keys
	* 
	* From: https://github.com/martynsmith/node-irc/blob/master/lib/irc.js
	*/
	function parseMessage(line) { // {{{
		var message = {};
		var match;

		// Parse prefix
		if ( match = line.match(/^:([^ ]+) +/) ) {
		    message.prefix = match[1];
		    line = line.replace(/^:[^ ]+ +/, '');
		    if ( match = message.prefix.match(/^([_a-zA-Z0-9\[\]\\`^{}|-]*)(!([^@]+)@(.*))?$/) ) {
		        message.nick = match[1];
		        message.user = match[3];
		        message.host = match[4];
		    }
		    else {
		        message.server = message.prefix;
		    }
		}

		// Parse command
		match = line.match(/^([^ ]+) */);
		message.command = match[1];
		message.rawCommand = match[1];
		message.commandType = 'normal';
		line = line.replace(/^[^ ]+ +/, '');

		message.args = [];
		var middle, trailing;

		// Parse parameters
		if ( line.indexOf(':') != -1 ) {
		    var index = line.indexOf(':');
		    middle = line.substr(0, index).replace(/ +$/, "");
		    trailing = line.substr(index+1);
		}
		else {
		    middle = line;
		}

		if ( middle.length )
		    message.args = middle.split(/ +/);

		if ( typeof(trailing) != 'undefined' && trailing.length )
		    message.args.push(trailing);

		return message;
	}

}

