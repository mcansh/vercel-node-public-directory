"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAwsLauncher = exports.makeAwsLauncher = exports.getNowLauncher = exports.makeNowLauncher = void 0;
const url_1 = require("url");
const http_1 = require("http");
const bridge_1 = require("./bridge");
function makeNowLauncher(config) {
    const { entrypointPath, bridgePath, helpersPath, sourcemapSupportPath, shouldAddHelpers = false, shouldAddSourcemapSupport = false, } = config;
    return `const bridge_1 = require(${JSON.stringify(bridgePath)});
const http_1 = require("http");
${shouldAddSourcemapSupport
        ? `require(${JSON.stringify(sourcemapSupportPath)});`
        : ""}
const entrypointPath = ${JSON.stringify(entrypointPath)};
const shouldAddHelpers = ${JSON.stringify(shouldAddHelpers)};
const helpersPath = ${JSON.stringify(helpersPath)};

const bridge = (${getNowLauncher(config)})();
exports.launcher = bridge.launcher;`;
}
exports.makeNowLauncher = makeNowLauncher;
function getNowLauncher({ entrypointPath, helpersPath, shouldAddHelpers = false, }) {
    return function () {
        let bridge = new bridge_1.Bridge();
        let isServerListening = false;
        const originalListen = http_1.Server.prototype.listen;
        http_1.Server.prototype.listen = function listen() {
            isServerListening = true;
            console.log("Legacy server listening...");
            bridge.setServer(this);
            http_1.Server.prototype.listen = originalListen;
            bridge.listen();
            return this;
        };
        if (!process.env.NODE_ENV) {
            const region = process.env.VERCEL_REGION || process.env.NOW_REGION;
            process.env.NODE_ENV = region === "dev1" ? "development" : "production";
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            let listener = require(entrypointPath);
            if (listener.default)
                listener = listener.default;
            if (typeof listener.listen === "function") {
                http_1.Server.prototype.listen = originalListen;
                const server = listener;
                bridge.setServer(server);
                bridge.listen();
            }
            else if (typeof listener === "function") {
                http_1.Server.prototype.listen = originalListen;
                let server;
                if (shouldAddHelpers) {
                    bridge = new bridge_1.Bridge(undefined, true);
                    server = require(helpersPath).createServerWithHelpers(listener, bridge);
                }
                else {
                    server = http_1.createServer(listener);
                }
                bridge.setServer(server);
                bridge.listen();
            }
            else if (typeof listener === "object" &&
                Object.keys(listener).length === 0) {
                setTimeout(() => {
                    if (!isServerListening) {
                        console.error("No exports found in module %j.", entrypointPath);
                        console.error("Did you forget to export a function or a server?");
                        process.exit(1);
                    }
                }, 5000);
            }
            else {
                console.error("Invalid export found in module %j.", entrypointPath);
                console.error("The default export must be a function or server.");
            }
        }
        catch (err) {
            if (err.code === "MODULE_NOT_FOUND") {
                console.error(err.message);
                console.error('Did you forget to add it to "dependencies" in `package.json`?');
            }
            else {
                console.error(err);
            }
            process.exit(1);
        }
        return bridge;
    };
}
exports.getNowLauncher = getNowLauncher;
function makeAwsLauncher(config) {
    const { entrypointPath, awsLambdaHandler = "" } = config;
    return `const url_1 = require("url");
const funcName = ${JSON.stringify(awsLambdaHandler.split(".").pop())};
const entrypointPath = ${JSON.stringify(entrypointPath)};
exports.launcher = ${getAwsLauncher(config)}`;
}
exports.makeAwsLauncher = makeAwsLauncher;
function getAwsLauncher({ entrypointPath, awsLambdaHandler = "", }) {
    const funcName = awsLambdaHandler.split(".").pop();
    if (typeof funcName !== "string") {
        throw new TypeError('Expected "string"');
    }
    // @ts-ignore
    return function (e, context, callback) {
        const { path, method: httpMethod, body, headers } = JSON.parse(e.body);
        const { query } = url_1.parse(path, true);
        const queryStringParameters = {};
        for (const [key, value] of Object.entries(query)) {
            if (typeof value === "string") {
                queryStringParameters[key] = value;
            }
        }
        const awsGatewayEvent = {
            resource: "/{proxy+}",
            path: path,
            httpMethod: httpMethod,
            body: body,
            isBase64Encoded: true,
            queryStringParameters: queryStringParameters,
            multiValueQueryStringParameters: query,
            headers: headers,
        };
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(entrypointPath);
        return mod[funcName](awsGatewayEvent, context, callback);
    };
}
exports.getAwsLauncher = getAwsLauncher;
