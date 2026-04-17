import { kv } from '@vercel/kv';
import * as cheerio from 'cheerio';

// Separate parsing logic into a dedicated function for easy updating
function extractLinkedInPosts(html, maxPosts) {
    const $ = cheerio.load(html);
    const posts = [];

    // Fallback/standard selectors for LinkedIn organic posts (subject to change)
    // .feed-shared-update-v2__description is a common class for post text
    $('.feed-shared-update-v2__description').each((i, el) => {
        if (posts.length >= maxPosts) return false;
        
        let text = $(el).text().trim();
        // Clean up excess whitespace
        text = text.replace(/\s+/g, ' ');

        if (text) {
            // Find the date or time elapsed
            let dateStr = "Recent";
            const updateContainer = $(el).closest('.feed-shared-update-v2');
            const dateEl = updateContainer.find('.update-components-actor__sub-description, .visually-hidden').first();
            
            if (dateEl.length) {
                // Often contains "1w", "1d", or actual dates
                dateStr = dateEl.text().replace(/\s+/g, ' ').trim() || dateStr;
            }

            posts.push({
                text: text,
                date: dateStr,
                url: 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/'
            });
        }
    });

    return posts;
}

export default async function handler(req, res) {
    // Basic protection to only allow the cron job to run this route
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const url = 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/';
        
        // Realistic User-Agent to avoid immediate block
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        };

        const response = await fetch(url, { headers });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch LinkedIn: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        
        // Parse up to 15 posts
        const posts = extractLinkedInPosts(html, 15);

        // Store the result in Vercel KV
        // Note: As KV is highly stateful, we overwrite to match standard caching models
        await kv.set('linkedin_posts', JSON.stringify(posts));

        return res.status(200).json({ success: true, count: posts.length, posts });
    } catch (error) {
        console.error('Cron job error:', error);
        return res.status(500).json({ error: error.message || 'Error occurred fetching posts' });
    }
}
