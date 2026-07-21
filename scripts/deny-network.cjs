"use strict";

const BLOCKED_MESSAGE =
  "Foodseyo network-free validation blocked an outbound connection.";

const blocked = () => {
  throw new Error(BLOCKED_MESSAGE);
};

const blockedAsync = async () => {
  throw new Error(BLOCKED_MESSAGE);
};

const net = require("node:net");
const tls = require("node:tls");
const http = require("node:http");
const https = require("node:https");
const http2 = require("node:http2");
const dgram = require("node:dgram");

net.Socket.prototype.connect = blocked;
net.connect = blocked;
net.createConnection = blocked;
tls.connect = blocked;
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
http2.connect = blocked;
dgram.createSocket = blocked;
globalThis.fetch = blockedAsync;

if ("WebSocket" in globalThis) {
  globalThis.WebSocket = class NetworkBlockedWebSocket {
    constructor() {
      blocked();
    }
  };
}
