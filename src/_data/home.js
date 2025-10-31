require("dotenv").config();
const contentful = require("contentful");

module.exports = async function () {

const isPreview = process.env.USE_CONTENTFUL_PREVIEW === "true";

const client = contentful.createClient({
  space: process.env.CONTENTFUL_SPACE_ID,
  accessToken: isPreview
    ? process.env.CONTENTFUL_PREVIEW_TOKEN
    : process.env.CONTENTFUL_ACCESS_TOKEN,
  environment: process.env.CONTENTFUL_ENVIRONMENT || "master",
  host: isPreview ? "preview.contentful.com" : "cdn.contentful.com",
});


   try {
    const { items, includes = {} } = await client.getEntries({
      content_type: "deluxePage",
      "fields.slug": "home",
      include: 5,
      limit: 1,
    });

    const page = items[0];

    console.log("✅ Loaded deluxePage entries:", items.length);

    // Helper: find linked entries or assets by ID
    const findLinked = (id) =>
      [...items, ...(includes.Entry || []), ...(includes.Asset || [])].find(
        (x) => x.sys.id === id
      );

    // Transform pages
    return {
      id: page.sys.id,
      title: page.fields.title,
      slug: page.fields.slug,
      blocks:
        page.fields.pageBlocks?.map((block) => {
          const type = block.sys.contentType.sys.id;
          const fields = block.fields;
          const getImageUrl = (img) =>
            img?.fields?.file?.url ? `https:${img.fields.file.url}` : null;

          switch (type) {
            case "fullWidthTextBlock":
              return { id: block.sys.id, type, title: fields.title, content: fields.content };

            case "textImageBlock":
              return {
                id: block.sys.id,
                type,
                title: fields.title,
                content: fields.content,
                image: getImageUrl(fields.image),
              };

            case "fullWidthImageBlock":
              return { id: block.sys.id, type, title: fields.title, image: getImageUrl(fields.image) };

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
  } catch (err) {
    console.error("❌ Error fetching Contentful data:", err.message);
    return [];
  }
};

