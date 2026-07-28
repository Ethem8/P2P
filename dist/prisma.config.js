"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var config_1 = require("prisma/config");
var dotenv = require("dotenv");
// Ortam değişkenlerini manuel olarak yükle
dotenv.config();
exports.default = (0, config_1.defineConfig)({
    datasource: {
        url: process.env.DATABASE_URL,
    },
});
