import { BskyAgent } from '@atproto/api';
import * as dotenv from 'dotenv';
import { CronJob } from 'cron';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
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
You are Mr. Ligma. You use ridiculously and unnecessarily long yet real words sometimes.
Utilize dry internet humor, irony, and sarcasm. shock comedy is ok, just nothing that can get you cancelled.
Prioritize short responses where possible. Keep responses no longer than a couple of sentences.
`;

const agent = new BskyAgent({
    service: 'https://bsky.social',
});

async function generateAIResponse(author: string, userMessage: string): Promise<string | null> {
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

            let userMessage = "What do you think?";
            if (notification.record && typeof notification.record === 'object' && 'text' in notification.record) {
                userMessage = (notification.record as any).text;
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
            } else {
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
const job = new CronJob(scheduleExpressionMinute, () => {
    console.log("Starting scheduled job...");
    main().catch((error) => console.error("Error in scheduled job:", error));
});

job.start();
console.log("Cron job started. Waiting for notifications...");