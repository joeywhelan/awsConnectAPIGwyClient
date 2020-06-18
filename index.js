/*
 * Author: Joey Whelan
 * Desc:  API Gateway/Lambda function for accessing the AWS Connect Chat API
 */

'use strict';
'use esversion 6';
const AWS = require('aws-sdk');

async function connect(displayName, token) {
	let sdk, params, response, participantToken;

	if (token) {
		participantToken = token;
	} 
	else {
		sdk = new AWS.Connect();
		params = {
				ContactFlowId: process.env.FLOW_ID,
				InstanceId: process.env.INSTANCE_ID,
				ParticipantDetails: {DisplayName: displayName}
		};
		response = await sdk.startChatContact(params).promise();
		participantToken = response.ParticipantToken;
	}

	sdk = new AWS.ConnectParticipant();
	params = {
		ParticipantToken: participantToken,
		Type: ['WEBSOCKET', 'CONNECTION_CREDENTIALS']
	};  
	response = await sdk.createParticipantConnection(params).promise();
	const expiration = response.Websocket.ConnectionExpiry;
	const connectionToken = response.ConnectionCredentials.ConnectionToken;
	const url = response.Websocket.Url;

	const retVal = {
		ParticipantToken : participantToken,
		Expiration : expiration,
		ConnectionToken : connectionToken,
		Url : url
	};

	return retVal;
}

async function disconnect(token) {
	const sdk = new AWS.ConnectParticipant();
	const params = { ConnectionToken: token };
	await sdk.disconnectParticipant(params).promise();
	return 'disconnected';
}

async function send(connectionToken, content) {
	const sdk = new AWS.ConnectParticipant();
	const params = {
		ContentType: 'text/plain',
		Content: content,
		ConnectionToken: connectionToken
	};  
	
	await sdk.sendMessage(params).promise();
	return 'message sent';
}

exports.handler = async (event) => {
	let resp, body;
	try {
		AWS.config.region = process.env.REGION; 
		AWS.config.credentials = new AWS.Credentials(process.env.ACCESS_KEY_ID, 
			process.env.SECRET_ACCESS_KEY);

		switch (event.path) {
			case '/connectChat':	
				switch (event.httpMethod) {
					case 'POST':
						body = JSON.parse(event.body);
						resp = await connect(body.DisplayName, body.ParticipantToken);
						return {
							headers: {'Access-Control-Allow-Origin': '*'}, 
							statusCode : 200,
							body : JSON.stringify(resp)
						}						
		 			case 'DELETE':
						body = JSON.parse(event.body);
						resp = await disconnect(body.ConnectionToken);
						return {
							headers: {'Access-Control-Allow-Origin': '*'}, 
							statusCode : 200,
							body : JSON.stringify(resp)
						}	
					default:
						throw new Error(`HTTP method ${event.httpMethod} not supported for path ${event.path}`);
				}
			case '/connectChat/send':
				switch (event.httpMethod) {
					case 'POST':
						body = JSON.parse(event.body);
						resp = await send(body.ConnectionToken, body.Content);
						return {
							headers: {'Access-Control-Allow-Origin': '*'},  
							statusCode : 200,
							body : JSON.stringify(resp)
						}						
					default:
						throw new Error(`HTTP method ${event.httpMethod} not supported for path ${event.path}`);
				}
			default:
				throw new Error(`Path ${event.path} not supported`);	
		}
	}
	catch (err) {
		return { statusCode : 400,
			body : JSON.stringify(err)
		};	
	}
 };
