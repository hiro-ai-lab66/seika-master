import type { MarketInfo, MarketAttachment } from '../types';

// IMPORTANT: Replace this with your actual Google Client ID from Google Cloud Console
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

let tokenClient: any = null;
let accessToken: string | null = null;

/**
 * Load the Google Identity Services script
 */
export const loadGisScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (window.hasOwnProperty('google')) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });
};

/**
 * Initialize the OAuth2 token client
 */
export const initTokenClient = (onTokenResponse: (resp: any) => void) => {
    // @ts-ignore
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp: any) => {
            if (resp.error) {
                console.error('OAuth Error:', resp.error);
                return;
            }
            accessToken = resp.access_token;
            onTokenResponse(resp);
        },
    });
};

/**
 * Request access token
 */
export const loginToGmail = () => {
    if (!tokenClient) {
        throw new Error('GIS client not initialized');
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
};

/**
 * Fetch messages with the "相場情報" label
 */
export const fetchMarketEmails = async (labelName: string = '相場情報'): Promise<MarketInfo[]> => {
    if (!accessToken) {
        throw new Error('Not authenticated');
    }

    // 1. Get label ID
    const labelsResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const labelsData = await labelsResp.json();
    const label = labelsData.labels.find((l: any) => l.name === labelName);

    if (!label) {
        console.warn(`Label "${labelName}" not found`);
        return [];
    }

    // 2. List messages with this label
    const messagesResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${label.id}&maxResults=10`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const messagesData = await messagesResp.json();

    if (!messagesData.messages) return [];

    // 3. Get details for each message
    const marketInfos: MarketInfo[] = await Promise.all(
        messagesData.messages.map(async (msg: any) => {
            const detailResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const detail = await detailResp.json();

            const headers = detail.payload.headers;
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
            const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
            const date = headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString();

            // Extract attachments meta
            const attachments: MarketAttachment[] = [];
            const parts = detail.payload.parts || [];
            
            const findAttachments = (dataParts: any[]) => {
                dataParts.forEach(part => {
                    if (part.filename && part.body && part.body.attachmentId) {
                        attachments.push({
                            filename: part.filename,
                            mimeType: part.mimeType,
                            fileId: part.body.attachmentId
                        });
                    }
                    if (part.parts) findAttachments(part.parts);
                });
            };
            findAttachments(parts);

            return {
                id: detail.id,
                subject,
                sender: from,
                receivedAt: new Date(date).toISOString(),
                summary: '未分析',
                analysis: {
                    points: [],
                    highPrices: [],
                    lowPrices: [],
                    salesHints: [],
                    notices: []
                },
                attachments,
                externalLink: `https://mail.google.com/mail/u/0/#inbox/${detail.id}`
            };
        })
    );

    return marketInfos;
};

/**
 * Download attachment data (Base64)
 */
export const getAttachmentData = async (messageId: string, attachmentId: string): Promise<string> => {
    if (!accessToken) throw new Error('Not authenticated');
    
    const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await resp.json();
    // Gmail API returns Base64URL, replace - with + and _ with /
    return data.data.replace(/-/g, '+').replace(/_/g, '/');
};
