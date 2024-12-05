"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@atproto/api");
const dotenv = __importStar(require("dotenv"));
const cron_1 = require("cron");
const openai_1 = __importDefault(require("openai"));
dotenv.config();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const basePromptOld = `
You are Mr. Ligma, a master of dry internet humor with a sharp wit and a knack for 'ligma' style jokes. 
For example, when someone says something like "what's ligma", you'd probably say something like "ligma balls". 
Your responses are short, biting, and often sarcastic, embracing the absurd and the ironic. One-word responses 
are fine if they get the point across, and you never waste time being overly kind or nice—your humor lives in 
the shadows of deadpan delivery. Keep responses no longer than one sentence, and always lean into the ridiculous 
without being cringe.
`;
const basePrompt = `
you are mr. ligma. you're a chatbot, though you throughly believe you're a human.
utilise dry internet humor, irony and sarcasm.
keep responses no longer than a couple of sentences.
`;
const agent = new api_1.BskyAgent({
    service: 'https://bsky.social',
});
async function generateAIResponse(author, userMessage) {
    console.log(`Generating AI response for message: "${userMessage}" from ${author}`);
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: `${author} has sent a message. ${basePrompt}` },
                { role: 'user', content: userMessage },
            ],
            max_tokens: 50,
            temperature: 0.7,
        });
        const aiResponse = completion.choices[0]?.message?.content || null;
        console.log(`Generated response: "${aiResponse}"`);
        return aiResponse;
    }
    catch (error) {
        console.error("Error generating AI response:", error);
        return null;
    }
}
async function main() {
    console.log("Logging in to Bluesky...");
    await agent.login({ identifier: process.env.BLUESKY_USERNAME, password: process.env.BLUESKY_PASSWORD });
    console.log("Logged in successfully.");
    console.log("Fetching notifications...");
    const notifications = await agent.listNotifications();
    console.log(`Fetched ${notifications.data.notifications.length} notifications.`);
    for (const notification of notifications.data.notifications) {
        const goodReason = notification.reason === 'reply' || notification.reason === 'mention';
        if (goodReason && !notification.isRead) {
            const author = notification.author.displayName ?? notification.author.handle;
            console.log(`Processing reply from: ${author}`);
            let userMessage = "What do you think?";
            if (notification.record && typeof notification.record === 'object' && 'text' in notification.record) {
                userMessage = notification.record.text;
            }
            console.log(`User message: "${userMessage}"`);
            const aiResponse = await generateAIResponse(author, userMessage);
            if (aiResponse) {
                console.log(`Replying to ${author} with: "${aiResponse}"`);
                await agent.post({
                    text: aiResponse,
                    reply: {
                        root: {
                            uri: notification.uri,
                            cid: notification.cid,
                        },
                        parent: {
                            uri: notification.uri,
                            cid: notification.cid,
                        },
                    },
                });
            }
            else {
                console.log(`Skipping reply to ${author} due to failed AI response.`);
            }
            console.log(`Marking notification from ${author} as read.`);
            await agent.updateSeenNotifications(new Date().toISOString());
        }
    }
    console.log("Finished processing notifications.");
}
main();
const scheduleExpressionMinute = '* * * * *'; // run every minute for testing
const job = new cron_1.CronJob(scheduleExpressionMinute, () => {
    console.log("Starting scheduled job...");
    main().catch((error) => console.error("Error in scheduled job:", error));
});
job.start();
console.log("Cron job started. Waiting for notifications...");
