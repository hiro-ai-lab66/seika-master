import type { MarketInfo, MarketAttachment } from '../types';

const CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID?.trim() || '';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_STORAGE_KEY = 'seika_market_access_token';

let tokenClient: any = null;
let accessToken: string | null = typeof window !== 'undefined'
    ? window.sessionStorage.getItem(TOKEN_STORAGE_KEY)
    : null;

export const hasGmailAccessToken = (): boolean => Boolean(accessToken);

const decodeBase64Url = (value: string): string => {
    try {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(normalized);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
    } catch (error) {
        console.error('Failed to decode Gmail body', error);
        return '';
    }
};

const stripHtml = (value: string): string => value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

const extractBodyText = (payload: any): string => {
    const texts: string[] = [];

    const visitPart = (part: any) => {
        if (!part) return;

        if (part.mimeType === 'text/plain' && part.body?.data) {
            texts.push(decodeBase64Url(part.body.data));
        } else if (part.mimeType === 'text/html' && part.body?.data) {
            texts.push(stripHtml(decodeBase64Url(part.body.data)));
        }

        if (Array.isArray(part.parts)) {
            part.parts.forEach(visitPart);
        }
    };

    visitPart(payload);

    if (texts.length === 0 && payload?.body?.data) {
        texts.push(decodeBase64Url(payload.body.data));
    }

    return texts
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

/**
 * Load the Google Identity Services script
 */
export const loadGisScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if ((window as any).google?.accounts?.oauth2) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if ((window as any).google?.accounts?.oauth2) {
                resolve();
                return;
            }
            reject(new Error('Google Identity Services did not initialize'));
        };
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });
};

/**
 * Initialize the OAuth2 token client
 */
export const initTokenClient = (onTokenResponse: (resp: any) => void) => {
    if (!CLIENT_ID) {
        throw new Error('Missing VITE_GOOGLE_CLIENT_ID');
    }

    const googleAccounts = (window as any).google?.accounts?.oauth2;
    if (!googleAccounts?.initTokenClient) {
        throw new Error('Google Identity Services is not loaded');
    }

    tokenClient = googleAccounts.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp: any) => {
            if (resp.error) {
                console.error('OAuth Error:', resp.error);
                return;
            }
            const nextAccessToken = resp.access_token as string | undefined;
            if (!nextAccessToken) {
                console.error('OAuth Error: missing access token');
                return;
            }
            accessToken = nextAccessToken;
            window.sessionStorage.setItem(TOKEN_STORAGE_KEY, nextAccessToken);
            onTokenResponse(resp);
        },
    });
};

/**
 * Request access token
 */
export const loginToGmail = (prompt: string = 'select_account consent') => {
    if (!tokenClient) {
        throw new Error('GIS client not initialized');
    }
    tokenClient.requestAccessToken({ prompt });
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
            const snippet = detail.snippet || '';
            const bodyText = extractBodyText(detail.payload);

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
                snippet,
                bodyText,
                summary: '未分析',
                analysis: {
                    points: [],
                    highPrices: [],
                    lowPrices: [],
                    salesHints: [],
                    notices: [],
                    majorProducePrices: []
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
