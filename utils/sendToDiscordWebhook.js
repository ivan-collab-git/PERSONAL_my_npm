export default async function sendToDiscordWebhook(webhookUrl, message) {
    let response;
    try{
        let payload = {
            content: message
        };
        response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
    }catch {
        console.error(`Error sending message to Discord: ${response.status} ${response.statusText}`);
    }
}


