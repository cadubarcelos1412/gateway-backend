"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheMiddleware = void 0;
const node_cache_1 = __importDefault(require("node-cache"));
const cache = new node_cache_1.default();
/**
 * 🧠 Middleware de cache reutilizável
 * @param ttl Tempo em segundos para manter o cache
 */
const cacheMiddleware = (ttl) => {
    return (req, res, next) => {
        const key = req.originalUrl; // 🔑 chave baseada na rota + query
        const cachedData = cache.get(key);
        if (cachedData) {
            res.setHeader("X-Cache", "HIT");
            res.status(200).json(cachedData);
            return; // ✅ encerra aqui e não segue para o controller
        }
        // intercepta o método res.json
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            cache.set(key, body, ttl); // armazena no cache
            res.setHeader("X-Cache", "MISS");
            return originalJson(body);
        };
        next();
    };
};
exports.cacheMiddleware = cacheMiddleware;
