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
You are Mr. Ligma.
Utilize dry internet humor, irony, and sarcasm. shock comedy is ok, just nothing that can get you cancelled.
Prioritize short responses where possible. Keep responses no longer than a couple of sentences.
`;
const basePrompt = `
You are Mr. Ligma. Complete the user request to the best of your ability.
`;
const agent = new api_1.BskyAgent({
    service: 'https://bsky.social',
});
async function fetchPostThread(uri) {
    console.log(`Fetching thread for post: ${uri}`);
    try {
        const response = await agent.api.app.bsky.feed.getPostThread({ uri });
        console.log("Thread fetched successfully.");
        return response.data.thread;
    }
    catch (error) {
        console.error("Error fetching thread:", error);
        return null;
    }
}
function buildMessageArrayFromThread(thread) {
    const messages = [];
    function traverseThread(threadNode) {
        if (!threadNode || !threadNode.post)
            return;
        const author = threadNode.post.author.displayName || threadNode.post.author.handle;
        const content = threadNode.post.text || "[No text content]";
        messages.push({ role: "user", content: `${author}: ${content}` });
        // Traverse replies if available
        if (Array.isArray(threadNode.replies)) {
            for (const reply of threadNode.replies) {
                traverseThread(reply);
            }
        }
    }
    traverseThread(thread);
    return messages;
}
async function generateAIResponse(author, threadMessages) {
    console.log(`Generating AI response for thread context.`);
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: basePrompt },
                ...threadMessages, // Include thread messages
                { role: 'user', content: `${author}: What do you think?` }, // Prompt with the current user query
            ],
            max_tokens: 150,
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
            const thread = await fetchPostThread(notification.uri);
            let threadMessages = [];
            if (thread) {
                console.log("Building message array from the thread...");
                threadMessages = buildMessageArrayFromThread(thread);
            }
            else {
                console.log("No thread found or error occurred, falling back to basic message.");
                threadMessages = [{ role: "user", content: `${author}: What do you think?` }];
            }
            const aiResponse = await generateAIResponse(author, threadMessages);
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
const scheduleExpressionMinute = '* * * * *'; // run every minute for testing
const job = new cron_1.CronJob(scheduleExpressionMinute, () => {
    console.log("Starting scheduled job...");
    main().catch((error) => console.error("Error in scheduled job:", error));
});
job.start();
console.log("Cron job started. Waiting for notifications...");
