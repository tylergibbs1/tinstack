import { loadConfig } from "./core/config";
import { setLogLevel, logger } from "./core/logger";
import { createServer, getEnabledServices } from "./server";

const config = loadConfig();
setLogLevel(config.logLevel);

const server = createServer(config);
const services = getEnabledServices(server);

logger.info(`tinstack v0.1.0`);
logger.info(`Listening on http://localhost:${server.port}`);
logger.info(`Region: ${config.defaultRegion} | Account: ${config.defaultAccountId} | Storage: ${config.storageMode}`);
logger.info(`Services: ${services.join(", ")}`);
