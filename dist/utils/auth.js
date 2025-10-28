"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserFromToken = void 0;
const auth_1 = require("../config/auth");
const user_model_1 = require("../models/user.model");
const getUserFromToken = async (token) => {
    if (!token)
        return null;
    const payload = await (0, auth_1.decodeToken)(token.replace("Bearer ", ""));
    if (!payload?.id)
        return null;
    const user = await user_model_1.User.findById(payload.id).lean();
    return user || null;
};
exports.getUserFromToken = getUserFromToken;
