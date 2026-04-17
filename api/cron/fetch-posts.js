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
        
        // 2. Mapping con Selezione Alta Qualità per le Immagini
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            // Fix Link: Trasforma link admin in link pubblici
            let publicUrl = post.url || 'https://www.linkedin.com/company/intelligent-heart-technology-lab/';
            if (publicUrl.includes('/admin/')) {
                const activityId = publicUrl.split('activity:')[1]?.split('/')[0];
                if (activityId) {
                    publicUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`;
                }
            }

            // Selezione Alta Qualità: Cerchiamo la risoluzione migliore
            const imagesArray = post.content?.images?.[0]?.image || [];
            const bestImage = imagesArray.find(img => img.width === 800) || 
                              imagesArray.find(img => img.width === 1280) ||
                              imagesArray[imagesArray.length - 1]; 

            const img = bestImage?.url || null;

            // Fix Avatar: Logo del Lab (versione alta qualità se possibile)
            const avatars = post.author?.avatar || [];
            const avatar = avatars[avatars.length - 1]?.url || null;

            return {
                text: post.text || '',
                date: post.created_at, 
                image_url: img,
                avatar_url: avatar,
                url: publicUrl
            };
        });

        if (mappedPosts.length > 0) {
            console.log('High-quality image mapping completed. Updating KV.');
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
            return res.status(200).json({ success: true, count: mappedPosts.length });
        } else {
            console.warn('0 posts found.');
            return res.status(200).json({ success: true, count: 0, preserved: true });
        }

    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(200).json({ success: false, error: error.message, preserved: true });
    }
}
