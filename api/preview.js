// api/preview.js
require("dotenv").config();
const contentful = require("contentful");

// Environment variables
const PREVIEW_SECRET = process.env.CONTENTFUL_PREVIEW_SECRET;
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const PREVIEW_ACCESS_TOKEN = process.env.CONTENTFUL_PREVIEW_TOKEN;
const ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";

module.exports = async function (req, res) {
  const { secret, slug } = req.query;

  // 1️⃣ Validate secret key
  if (secret !== PREVIEW_SECRET) {
    return res.status(401).json({ message: "Invalid preview secret" });
  }

  // 2️⃣ Create Contentful Preview client
  const client = contentful.createClient({
    space: SPACE_ID,
    accessToken: PREVIEW_ACCESS_TOKEN,
    environment: ENVIRONMENT,
    host: "preview.contentful.com",
  });

  try {
    // 3️⃣ Fetch matching page entry (by slug)
    const { items, includes = {} } = await client.getEntries({
      content_type: "deluxePage", // your custom content type
      "fields.slug": slug,
      include: 5,
      limit: 1,
    });

    if (!items.length) {
      return res.status(404).json({ message: "No entry found for that slug" });
    }

    const page = items[0];

    // Helper to find linked entries or assets by ID
    const findLinked = (id) =>
      [...items, ...(includes.Entry || []), ...(includes.Asset || [])].find(
        (x) => x.sys.id === id
      );

    // 4️⃣ Transform into structured data (like home.js)
    const getImageUrl = (img) =>
      img?.fields?.file?.url ? `https:${img.fields.file.url}` : null;

    const transformedPage = {
      id: page.sys.id,
      title: page.fields.title,
      slug: page.fields.slug,
      blocks:
        page.fields.pageBlocks?.map((block) => {
          const type = block.sys.contentType.sys.id;
          const fields = block.fields;

          switch (type) {
            case "fullWidthTextBlock":
              return {
                id: block.sys.id,
                type,
                title: fields.title,
                content: fields.content,
              };

            case "textImageBlock":
              return {
                id: block.sys.id,
                type,
                title: fields.title,
                content: fields.content,
                image: getImageUrl(fields.image),
              };

            case "fullWidthImageBlock":
              return {
                id: block.sys.id,
                type,
                title: fields.title,
                image: getImageUrl(fields.image),
              };

            case "storiesListingBlock":
              const stories =
                fields.selectStories
                  ?.map((link) => {
                    const story = findLinked(link.sys.id);
                    if (!story) return null;
                    return {
                      id: story.sys.id,
                      title: story.fields.title,
                      summary: story.fields.summary || story.fields.content,
                      image: getImageUrl(story.fields.image),
                    };
                  })
                  .filter(Boolean) || [];
              return { id: block.sys.id, type, title: fields.title, stories };

            default:
              return { id: block.sys.id, type, title: fields.title };
          }
        }) || [],
    };

    // 5️⃣ Return JSON preview
    return res.status(200).json(transformedPage);
  } catch (err) {
    console.error("❌ Error fetching preview:", err.message);
    return res.status(500).json({ message: "Error fetching preview" });
  }
};
