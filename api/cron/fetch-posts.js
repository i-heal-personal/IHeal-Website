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
        
        const mappedPosts = rawPosts.slice(0, 15).map(post => {
            // URL Pubblico
            let publicUrl = post.url || 'https://www.linkedin.com/company/intelligent-heart-technology-lab/';
            if (publicUrl.includes('/admin/')) {
                const activityId = publicUrl.split('activity:')[1]?.split('/')[0];
                if (activityId) {
                    publicUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`;
                }
            }

            // Selezione Immagine Massima Qualità (Main Post)
            const imagesArray = post.content?.images?.[0]?.image || post.image || [];
            const bestImage = [...imagesArray].sort((a, b) => (b.width || 0) - (a.width || 0))[0];
            const img = bestImage?.url || null;

            // Avatar Lab
            const avatars = post.author?.avatar || [];
            const avatar = avatars[avatars.length - 1]?.url || null;

            // --- GESTIONE REPOST / ARTICLE / VIDEO / DOCUMENT ---
            let reshared_content = null;
            
            // 1. Check for real reshared post
            if (post.reshared_post) {
                const inner = post.reshared_post;
                const innerImgs = inner.content?.images?.[0]?.image || inner.image || [];
                const innerBestImg = [...innerImgs].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
                
                reshared_content = {
                    author_name: inner.author?.name || 'LinkedIn User',
                    text: inner.text || '',
                    image_url: innerBestImg
                };
            } 
            // 2. Check for nested article/document/video
            else if (post.content?.article || post.content?.document || post.content?.video) {
                const item = post.content.article || post.content.document || post.content.video;
                reshared_content = {
                    author_name: item.source || item.provider || 'External Resource',
                    text: item.title || item.description || '',
                    image_url: img, // In articles, the main img is often the article preview
                    is_article: true,
                    domain: item.source || ''
                };
            }

            return {
                text: post.text || '',
                date: post.created_at, 
                image_url: (reshared_content ? null : img), // If repost, move image inside
                avatar_url: avatar,
                url: publicUrl,
                reshared_content: reshared_content
            };
        });

        if (mappedPosts.length > 0) {
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
