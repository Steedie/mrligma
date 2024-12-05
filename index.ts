import { BskyAgent } from '@atproto/api';
import * as dotenv from 'dotenv';
import { CronJob } from 'cron';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
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

const agent = new BskyAgent({
    service: 'https://bsky.social',
});

async function fetchPostThread(uri: string): Promise<any> {
    console.log(`Fetching thread for post: ${uri}`);
    try {
        const response = await agent.api.app.bsky.feed.getPostThread({ uri });
        console.log("Thread fetched successfully.");
        return response.data.thread;
    } catch (error) {
        console.error("Error fetching thread:", error);
        return null;
    }
}

function buildMessageArrayFromThread(thread: any): { role: "system" | "user" | "assistant"; content: string }[] {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];
    function traverseThread(threadNode: any) {
        if (!threadNode || !threadNode.post) return;
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

async function generateAIResponse(
    author: string,
    threadMessages: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<string | null> {
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
    } catch (error) {
        console.error("Error generating AI response:", error);
        return null;
    }
}

async function main() {
    console.log("Logging in to Bluesky...");
    await agent.login({ identifier: process.env.BLUESKY_USERNAME!, password: process.env.BLUESKY_PASSWORD! });
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
            let threadMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];
            if (thread) {
                console.log("Building message array from the thread...");
                threadMessages = buildMessageArrayFromThread(thread);
            } else {
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
            } else {
                console.log(`Skipping reply to ${author} due to failed AI response.`);
            }

            console.log(`Marking notification from ${author} as read.`);
            await agent.updateSeenNotifications(new Date().toISOString());
        }
    }

    console.log("Finished processing notifications.");
}

const scheduleExpressionMinute = '* * * * *'; // run every minute for testing
const job = new CronJob(scheduleExpressionMinute, () => {
    console.log("Starting scheduled job...");
    main().catch((error) => console.error("Error in scheduled job:", error));
});

job.start();
console.log("Cron job started. Waiting for notifications...");
