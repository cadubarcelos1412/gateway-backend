"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKYCStats = exports.uploadKYCDocuments = exports.updateKYC = exports.getAllKYCs = void 0;
const user_model_1 = require("../models/user.model");
/**
 * 🔍 Lista todos os KYCs do sistema
 * Para usar no painel master: POST /api/master/kycs
 */
const getAllKYCs = async (_req, res) => {
    try {
        // Busca usuários que possuem dados de KYC/verificação
        const kycs = await user_model_1.User.find({
            $or: [
                { 'kyc.status': { $exists: true } },
                { 'verification.status': { $exists: true } },
                { 'kyc': { $exists: true } }
            ]
        })
            .select('_id email name kyc verification selfieFile documentFile createdAt updatedAt')
            .lean();
        // Formata a resposta para o frontend
        const formattedKycs = kycs.map((user) => ({
            _id: user._id,
            email: user.email,
            name: user.name || '',
            status: user.kyc?.status || user.verification?.status || 'pending',
            selfieFile: user.selfieFile || user.kyc?.selfieFile || '',
            documentFile: user.documentFile || user.kyc?.documentFile || '',
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }));
        res.status(200).json({
            status: true,
            kyc: formattedKycs
        });
    }
    catch (error) {
        console.error("❌ Erro em getAllKYCs:", error);
        res.status(500).json({
            status: false,
            msg: "Erro ao buscar KYCs."
        });
    }
};
exports.getAllKYCs = getAllKYCs;
/**
 * ✏️ Atualiza status de um KYC
 * Para usar no painel master: POST /api/master/kyc/update
 */
const updateKYC = async (req, res) => {
    try {
        const { _id, status, email } = req.body;
        // Validação
        if (!_id && !email) {
            res.status(400).json({
                status: false,
                msg: "É necessário fornecer _id ou email do usuário."
            });
            return;
        }
        if (!status || !['pending', 'approved', 'refused'].includes(status)) {
            res.status(400).json({
                status: false,
                msg: "Status inválido. Use: pending, approved ou refused."
            });
            return;
        }
        // Busca por _id ou email
        const query = _id ? { _id } : { email };
        // Atualiza o KYC
        const user = await user_model_1.User.findOneAndUpdate(query, {
            $set: {
                'kyc.status': status,
                'verification.status': status,
                updatedAt: new Date()
            }
        }, { new: true }).select('-password');
        if (!user) {
            res.status(404).json({
                status: false,
                msg: "Usuário não encontrado."
            });
            return;
        }
        res.status(200).json({
            status: true,
            msg: `KYC ${status === 'approved' ? 'aprovado' : status === 'refused' ? 'rejeitado' : 'atualizado'} com sucesso.`,
            user
        });
    }
    catch (error) {
        console.error("❌ Erro em updateKYC:", error);
        res.status(500).json({
            status: false,
            msg: "Erro ao atualizar KYC."
        });
    }
};
exports.updateKYC = updateKYC;
/**
 * 📤 Upload de documentos KYC (se necessário)
 * Essa função pode ser usada para uploads de selfie/documentos
 */
const uploadKYCDocuments = async (req, res) => {
    try {
        const { userId, selfieFile, documentFile } = req.body;
        if (!userId) {
            res.status(400).json({
                status: false,
                msg: "userId é obrigatório."
            });
            return;
        }
        const updateData = { updatedAt: new Date() };
        if (selfieFile)
            updateData['kyc.selfieFile'] = selfieFile;
        if (documentFile)
            updateData['kyc.documentFile'] = documentFile;
        const user = await user_model_1.User.findByIdAndUpdate(userId, { $set: updateData }, { new: true }).select('-password');
        if (!user) {
            res.status(404).json({
                status: false,
                msg: "Usuário não encontrado."
            });
            return;
        }
        res.status(200).json({
            status: true,
            msg: "Documentos KYC atualizados com sucesso.",
            user
        });
    }
    catch (error) {
        console.error("❌ Erro em uploadKYCDocuments:", error);
        res.status(500).json({
            status: false,
            msg: "Erro ao fazer upload dos documentos KYC."
        });
    }
};
exports.uploadKYCDocuments = uploadKYCDocuments;
/**
 * 📊 Estatísticas de KYC
 * Retorna resumo de KYCs por status
 */
const getKYCStats = async (_req, res) => {
    try {
        const stats = await user_model_1.User.aggregate([
            {
                $match: {
                    $or: [
                        { 'kyc.status': { $exists: true } },
                        { 'verification.status': { $exists: true } }
                    ]
                }
            },
            {
                $group: {
                    _id: {
                        $ifNull: ['$kyc.status', '$verification.status']
                    },
                    count: { $sum: 1 }
                }
            }
        ]);
        const formattedStats = {
            pending: 0,
            approved: 0,
            refused: 0,
            total: 0
        };
        stats.forEach((stat) => {
            if (stat._id === 'pending')
                formattedStats.pending = stat.count;
            if (stat._id === 'approved')
                formattedStats.approved = stat.count;
            if (stat._id === 'refused')
                formattedStats.refused = stat.count;
            formattedStats.total += stat.count;
        });
        res.status(200).json({
            status: true,
            stats: formattedStats
        });
    }
    catch (error) {
        console.error("❌ Erro em getKYCStats:", error);
        res.status(500).json({
            status: false,
            msg: "Erro ao buscar estatísticas de KYC."
        });
    }
};
exports.getKYCStats = getKYCStats;
