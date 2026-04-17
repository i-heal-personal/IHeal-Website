import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. Security check for Cron Secret
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Updated to Fresh LinkedIn Scraper API as requested
        const url = 'https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/user/posts?urn=ACoAABCtiL8B26nfi3Nbpo_AM8ngg4LeClT1Wh8&page=1';
        
        console.log('Fetching LinkedIn data via Fresh LinkedIn Scraper API...');
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY, // Recommending to keep this in Env Vars
                'X-RapidAPI-Host': 'fresh-linkedin-scraper-api.p.rapidapi.com',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }

        const result = await response.json();
        
        // --- DEBUG LOG ---
        console.log('Raw API Response (Snippet):', JSON.stringify(result).substring(0, 700));

        // Extraction logic for the new API (usually 'data' or 'posts')
        let rawPosts = result.data || result.posts || (Array.isArray(result) ? result : []);
        
        // Robust mapping for the structure of 'fresh-linkedin-scraper-api'
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            return {
                text: post.text || post.commentary || post.description || '',
                date: post.posted_at || post.time_description || 'Recent',
                image: post.image_url || post.image || (post.images && post.images.length > 0 ? post.images[0] : null)
            };
        });

        if (mappedPosts.length > 0) {
            console.log(`Successfully mapped ${mappedPosts.length} posts. Updating KV.`);
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
        } else {
            console.warn('No posts found in response. Preserving existing data.');
        }

        return res.status(200).json({ 
            success: true, 
            count: mappedPosts.length,
            debug_sample: mappedPosts[0] || null
        });

    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(200).json({ 
            success: false, 
            error: error.message,
            preserved: true 
        });
    }
}
