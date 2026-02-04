
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getBusinessInsights = async (stats: { totalAmount: number, supplierCount: number }) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Based on these business matchmaking results:
      Total Negotiated: R$ ${stats.totalAmount.toLocaleString('pt-BR')}
      Suppliers Negotiated: ${stats.supplierCount}
      
      Give a very short, professional business insight (1-2 sentences) in Portuguese to encourage the user for the next rounds.`,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "Continue negociando para expandir suas parcerias e otimizar seus custos!";
  }
};

export const generateRecoveryEmailContent = async (companyName: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Write a professional password recovery email draft in Portuguese for a company named "${companyName}". 
      Mention that a secure link has been generated to reset their password for the AC Round platform. 
      Keep it formal and clear.`,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Email Error:", error);
    return `Olá ${companyName}, recebemos uma solicitação de redefinição de senha para sua conta no AC Round. Clique no link seguro para prosseguir.`;
  }
};
