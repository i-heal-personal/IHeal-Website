import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    try {
        // Read directly from Vercel KV
        const postsData = await kv.get('linkedin_posts');
        
        let posts = [];
        if (postsData) {
            // KV sometimes returns the raw object, sometimes stringified depending on set context
            posts = typeof postsData === 'string' ? JSON.parse(postsData) : postsData;
        }

        return res.status(200).json({ success: true, posts });
    } catch (error) {
        console.error('API Error getting posts:', error);
        return res.status(500).json({ error: 'Failed to retrieve posts' });
    }
}
