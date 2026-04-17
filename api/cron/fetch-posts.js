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
        
        // 2. Mapping Intelligente basato su Priorità Contenuto
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            // Data Reale (Prendi ISO string)
            const realDate = post.created_at;

            // CASO A: Articolo / Repost
            let articleBox = null;
            if (post.content?.article) {
                const art = post.content.article;
                // Trova thumbnail migliore
                const thumbs = art.thumbnail || [];
                const bestThumb = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
                
                articleBox = {
                    title: art.title || '',
                    link: art.original_url || post.url,
                    image: bestThumb
                };
            }

            // CASO B: Immagini / Carosello (se non c'è articolo)
            let mainImage = null;
            if (!articleBox && post.content?.images) {
                const imgs = post.content.images[0]?.image || [];
                mainImage = [...imgs].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
            }

            return {
                text: post.text || '',
                date: realDate,
                image_url: mainImage,
                article: articleBox,
                url: post.url
            };
        });

        if (mappedPosts.length > 0) {
            console.log('Intelligent content mapping completed. Updating KV.');
            await kv.set('linkedin_posts', JSON.stringify(mappedPosts));
            return res.status(200).json({ success: true, count: mappedPosts.length });
        } else {
            return res.status(200).json({ success: true, count: 0, preserved: true });
        }

    } catch (error) {
        console.error('API Error:', error.message);
        return res.status(200).json({ success: false, error: error.message, preserved: true });
    }
}
