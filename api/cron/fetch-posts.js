import { kv } from '@vercel/kv';
import * as cheerio from 'cheerio';

// Separate parsing logic into a dedicated function for easy updating
function extractLinkedInPosts(html, maxPosts) {
    const $ = cheerio.load(html);
    const posts = [];

    // Log the title for identification (Login/Authwall check)
    const pageTitle = $('title').text().trim();
    console.log('Page Title:', pageTitle);

    // Generic and updated selectors for LinkedIn posts
    // We search for standard article tags or feed update containers
    $('article, .feed-shared-update-v2, .main-feed-item, .updates-data-layer').each((i, el) => {
        if (posts.length >= maxPosts) return false;
        
        // Find text content within the post
        const textContainer = $(el).find('.feed-shared-update-v2__description, .update-components-text, .feed-shared-text, p').first();
        let text = textContainer.text().trim();
        
        // Clean up excess whitespace
        text = text.replace(/\s+/g, ' ');

        if (text && text.length > 15) {
            // Find the date or time elapsed
            let dateStr = "Recent";
            const dateEl = $(el).find('.update-components-actor__sub-description, .visually-hidden, .feed-shared-actor__sub-description, time').first();
            
            if (dateEl.length) {
                dateStr = dateEl.text().replace(/\s+/g, ' ').trim().split('•')[0] || dateStr;
            }

            posts.push({
                text: text,
                date: dateStr,
                url: 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/'
            });
        }
    });

    return { posts, pageTitle };
}

export default async function handler(req, res) {
    // 1. Debug Logs for Auth
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    
    console.log('--- Cron Job Debug ---');
    if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
        console.error('Authorization Failed.');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    try {
        // Updated URL for public feed access
        const url = 'https://www.linkedin.com/posts/intelligent-heart-technology-lab_recent/?trk=public_post';
        
        // Comprehensive 'Fingerprint' headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'accept-language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
            'cache-control': 'max-age=0',
            'upgrade-insecure-requests': '1',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'DNT': '1'
        };

        console.log('Fetching LinkedIn URL:', url);
        const response = await fetch(url, { headers });
        console.log('Fetch Status:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error(`LinkedIn Fetch Failed: ${response.status}`);
        }

        const html = await response.text();
        
        // Parse posts and get page title
        const { posts, pageTitle } = extractLinkedInPosts(html, 15);
        console.log('Posts found:', posts.length);

        if (posts.length === 0) {
            console.warn('CRITICAL: 0 posts extracted. Verification needed.');
            console.log('HTML Tag Snippet:', html.substring(0, 500));
            
            if (pageTitle.toLowerCase().includes('login') || pageTitle.toLowerCase().includes('auth') || html.includes('authwall')) {
                console.error('DETECTED: LinkedIn redirected to a Login/Auth wall.');
            }
        }

        // Save to KV (overwriting previous)
        await kv.set('linkedin_posts', JSON.stringify(posts));

        return res.status(200).json({ 
            success: true, 
            count: posts.length, 
            debug: { title: pageTitle, htmlSize: html.length }
        });

    } catch (error) {
        console.error('Runtime Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
