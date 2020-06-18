/*
 * Author: Joey Whelan
 * Desc:  Simple web client for AWS Connect chat
 */

class UIHelper {
	static id(id) {
        return document.getElementById(id);
    }

    static empty(element) {
        while (element.hasChildNodes()) {
            element.removeChild(element.lastChild);
        }
    }

    static show(element) {
        const display = element.getAttribute('data-display');
        // Empty string as display restores the default.
        if (display || display === '') {
            element.style.display = display;
        }
    }

    static hide(element) {
        element.setAttribute('data-display', element.style.display);
        element.style.display = 'none';
    }
    
    static displayText(fromUser, text) {
    	const chatLog = UIHelper.id('chatLog');	
    	const msg = fromUser + ' ' + text;
    	chatLog.appendChild(document.createTextNode(msg));
        chatLog.appendChild(document.createElement('br'));
        chatLog.scrollTop = chatLog.scrollHeight - chatLog.offsetHeight;  
    }
} 

class Chat {
	constructor() {
		this._reset();
	}

	async disconnect() {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
		}

		if (this.chatSocket) {
			this.chatSocket.close();
		}

		if (this.connectionToken) {
			try {	
				const body = {
					ConnectionToken: this.connectionToken
				};
				const response = await fetch(API_URL, {
					method: 'DELETE',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(body)
				});
			}
			catch (err) {
				console.log(err);
			}
		}

		this._reset();
	}

	async leave() {
		UIHelper.id('chatLog').innerHTML = '';
		UIHelper.show(UIHelper.id('start'));
		UIHelper.hide(UIHelper.id('started'));
		UIHelper.id('firstName').focus();
		await this.disconnect();
	}
	
	async send() {
		var phrase = UIHelper.id('phrase');
		var content = phrase.value.trim();
		phrase.value = '';

		if (!content || !content.length) {
			return;
		}
		else {
			try {
				const body = {
					'Content': content,
					'ConnectionToken': this.connectionToken
				};
				const response = await fetch(API_URL + '/send', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(body)
				});
				const json = await response.json();
				if (!response.ok) {
					throw new Error(json);
				}
				UIHelper.displayText(this.displayName + ':', content);
			}
			catch(err) {
				console.log(err);
			}
		}
	}

	async start(firstName, lastName) {
		if (!firstName || !lastName) {
			alert('Please enter a first and last name');
			return;
		} 
		else {
			this.displayName = firstName + ' ' + lastName;
			await this._connect();
			UIHelper.displayText('System:', 'Connecting...');
		}
	}

	async _connect() {		
		try {
			const body = {
				DisplayName: this.displayName,
				ParticipantToken: this.participantToken
			};
			const response = await fetch(API_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(body)
			});
			
			const json = await response.json();
			if (response.ok) {
				this.participantToken = json.ParticipantToken;
				const diff = Math.abs(new Date() - Date.parse(json.Expiration));
				this.refreshTimer = setTimeout(this._connect, diff - 5000); //refresh the websocket
				this.connectionToken = json.ConnectionToken;
				this._subscribe(json.Url);
			}
			else {
				throw new Error(JSON.stringify(json));
			}
		}
		catch(err) {
			console.log(err);
		}
	}

	_reset() {
		this.displayName = null;
		this.participantToken = null;
		this.refreshTimer = null;
		this.connectionToken = null;
		this.chatSocket = null;
		this.connected = false;
	}

	_subscribe(url) {	
		this.chatSocket = new WebSocket(url);

		this.chatSocket.onopen = () => {
			const msg = {"topic":"aws/subscribe","content":{"topics":["aws/chat"]}};
			this.chatSocket.send(JSON.stringify(msg));
		};

		this.chatSocket.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			if (msg.topic === 'aws/chat' && msg.contentType === 'application/json') {
				const content = JSON.parse(msg.content);
				switch (content.Type) {
					case 'MESSAGE': 
						if (content.ParticipantRole !== 'CUSTOMER') {
							if (!this.connected) {
								UIHelper.hide(UIHelper.id('start'));
								UIHelper.show(UIHelper.id('started'));
								UIHelper.id('sendButton').disabled = false;
								UIHelper.id('phrase').focus();
								this.connected = true;
							}			
							UIHelper.displayText(content.DisplayName + ':', content.Content);
						}
						break;
					case 'EVENT':
						if (content.ContentType.includes('ended')) {
							UIHelper.id('sendButton').disabled = true;
							this.connectionToken = null;
						}
						break;
				}
			}
		};

		this.chatSocket.onerror = (err) => {
			console.error('WebSocket Error: ' + error);
		};
	}
}

window.addEventListener('DOMContentLoaded', function() {
	const chat = new Chat();
    UIHelper.show(UIHelper.id('start'));
    UIHelper.hide(UIHelper.id('started'));
    UIHelper.id('startButton').onclick = function() {
        chat.start(UIHelper.id('firstName').value, UIHelper.id('lastName').value);
    }.bind(chat);
    UIHelper.id('sendButton').onclick = chat.send.bind(chat);
    UIHelper.id('leaveButton').onclick = chat.leave.bind(chat);
    UIHelper.id('firstName').autocomplete = 'off';
    UIHelper.id('firstName').focus();
    UIHelper.id('lastName').autocomplete = 'off';
    UIHelper.id('phrase').autocomplete = 'off';
    UIHelper.id('phrase').onkeyup = function(e) {
        if (e.keyCode === 13) {
            chat.send();
        }
    }.bind(chat);
        
    window.onunload = function() {
		if (chat) {
			chat.disconnect();
		}
    }.bind(chat); 
});
