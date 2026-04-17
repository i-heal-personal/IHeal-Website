import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. Security Check
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const url = 'https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/company/posts?company_id=108797979';
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'fresh-linkedin-scraper-api.p.rapidapi.com',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        const rawPosts = result.data || [];
        
        // 2. Precise Mapping based on latest JSON inspection
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            // URL: Use post.url directly if it exists, otherwise sanitizing
            let publicUrl = post.url || post.post_url || 'https://www.linkedin.com/company/intelligent-heart-technology-lab/';
            if (publicUrl.includes('/admin/')) {
                const urnMatch = publicUrl.match(/activity:(\d+)/);
                if (urnMatch && urnMatch[1]) {
                    publicUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${urnMatch[1]}`;
                } else {
                    publicUrl = 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/';
                }
            }

            // Image: post.image[0].url
            let img = null;
            if (post.image && Array.isArray(post.image) && post.image.length > 0) {
                img = post.image[0].url || null;
            }

            return {
                text: post.text || '',
                date: post.created_at || null, // Individual date for each post
                image_url: img,
                url: publicUrl
            };
        });

        if (mappedPosts.length > 0) {
            console.log('Final refined mapping completed. Updating KV.');
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
            return res.status(200).json({ success: true, count: mappedPosts.length });
        } else {
            console.warn('0 posts found.');
            return res.status(200).json({ success: true, count: 0, preserved: true });
        }

    } catch (error) {
        console.error('Final Mapping API Error:', error.message);
        return res.status(200).json({ success: false, error: error.message, preserved: true });
    }
}
