import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. Security Check
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const url = 'https://fresh-linkedin-scraper-api.p.rapidapi.com/api/v1/company/posts?company_id=108797979';
        
        console.log('Fetching LinkedIn Company Posts via Fresh API...');
        
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
        
        // --- DEBUG LOG ---
        console.log('Raw API Response (First Post):', JSON.stringify(result.data ? result.data[0] : {}).substring(0, 500));

        const rawPosts = result.data || [];
        
        // 2. Precise Mapping with Link Cleanup and Expanded Image Detection
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            // Fix Link: Remove admin references or build public URL
            let publicUrl = post.url || post.post_url || 'https://www.linkedin.com/company/intelligent-heart-technology-lab/';
            
            if (publicUrl.includes('/admin/')) {
                // If it's an admin link, we try to extract the ID and rebuild
                // Admin links often look like .../admin/dashboard/urn:li:fs_updateV2:urn:li:activity:712345...
                const urnMatch = publicUrl.match(/activity:(\d+)/);
                if (urnMatch && urnMatch[1]) {
                    publicUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${urnMatch[1]}`;
                } else {
                    // Fallback to general page if we can't clean it
                    publicUrl = 'https://www.linkedin.com/company/intelligent-heart-technology-lab/posts/';
                }
            }

            // Image detection: try all possible field names
            const image = post.image_url || post.media_url || post.post_image || 
                          (post.images && post.images.length > 0 ? post.images[0] : null) ||
                          (post.article && post.article.image ? post.article.image : null);

            console.log('Post Link:', publicUrl);
            console.log('Image found:', !!image);

            return {
                text: post.text || post.commentary || '',
                date: post.posted_at || 'Recent',
                image_url: image, // Using image_url consistently as requested
                url: publicUrl
            };
        });

        if (mappedPosts.length > 0) {
            console.log(`Successfully mapped ${mappedPosts.length} posts. Updating KV.`);
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
            return res.status(200).json({ success: true, count: mappedPosts.length });
        } else {
            console.warn('API returned 0 posts. Current KV data preserved.');
            return res.status(200).json({ success: true, count: 0, preserved: true });
        }

    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(200).json({ success: false, error: error.message, preserved: true });
    }
}
