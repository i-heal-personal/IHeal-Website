import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 1. Security check for Cron Secret
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Double-checked endpoint and params
        const url = 'https://linkedin-data-api.p.rapidapi.com/get-company-posts?username=intelligent-heart-technology-lab';
        
        console.log('Fetching LinkedIn data via RapidAPI...');
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'linkedin-data-api.p.rapidapi.com'
            }
        });

        if (!response.ok) {
            throw new Error(`RapidAPI responded with status: ${response.status}`);
        }

        const result = await response.json();
        
        // --- DEBUG LOG ---
        console.log('Raw API Response (Snippet):', JSON.stringify(result).substring(0, 700));

        // 2. Flexible data extraction
        // Checks various common patterns in RapidAPI responses (top-level array, .data.results, .data, .results)
        let rawPosts = [];
        if (Array.isArray(result)) {
            rawPosts = result;
        } else if (result.data && Array.isArray(result.data)) {
            rawPosts = result.data;
        } else if (result.results && Array.isArray(result.results)) {
            rawPosts = result.results;
        } else if (result.data && result.data.results && Array.isArray(result.data.results)) {
            rawPosts = result.data.results;
        } else if (result.data && result.data.data && Array.isArray(result.data.data)) {
            rawPosts = result.data.data;
        }
        
        // 3. Robust mapping with fallbacks for different key names
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            return {
                text: post.text || post.commentary || post.description || post.text_content || '',
                date: post.postDate || post.postedAt || post.timeDescription || 'Recent',
                image: post.image || post.mainImage || (post.images && post.images.length > 0 ? post.images[0] : null)
            };
        });

        if (mappedPosts.length > 0) {
            console.log(`Successfully mapped ${mappedPosts.length} posts. Updating KV.`);
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
        } else {
            console.warn('CRITICAL: No posts could be extracted from JSON. Check logs for response structure.');
        }

        return res.status(200).json({ 
            success: true, 
            count: mappedPosts.length,
            debug_snippet: JSON.stringify(result).substring(0, 200)
        });

    } catch (error) {
        console.error('RapidAPI Error:', error.message);
        return res.status(200).json({ 
            success: false, 
            error: error.message,
            preserved: true 
        });
    }
}
