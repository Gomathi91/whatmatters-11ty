require("dotenv").config();
const contentful = require("contentful");
const Eleventy = require("@11ty/eleventy"); 
const path = require("path");
const fs = require("fs");

const PREVIEW_SECRET = process.env.CONTENTFUL_PREVIEW_SECRET;
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const PREVIEW_TOKEN = process.env.CONTENTFUL_PREVIEW_TOKEN;
const ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";

module.exports = async function (req, res) {
  const { secret } = req.query;

  if (!secret || secret !== PREVIEW_SECRET) {
    return res.status(401).send("Invalid preview secret");
  }

  const client = contentful.createClient({
    space: SPACE_ID,
    accessToken: PREVIEW_TOKEN,
    environment: ENVIRONMENT,
    host: "preview.contentful.com",
  });

  let pageData;
  try {
    const { items, includes = {} } = await client.getEntries({
      content_type: "deluxePage",
      "fields.slug": "home",
      include: 5,
      limit: 1,
    });

    if (!items.length) {
      return res.status(404).send("No entry found for this slug");
    }

    const page = items[0];

    const findLinked = (id) =>
      [...items, ...(includes.Entry || []), ...(includes.Asset || [])].find(
        (x) => x.sys.id === id
      );

    const getImageUrl = (img) =>
      img?.fields?.file?.url ? `https:${img.fields.file.url}` : null;

    pageData = {
      id: page.sys.id,
      title: page.fields.title,
      slug: page.fields.slug,
      blocks:
        page.fields.pageBlocks?.map((block) => {
          const type = block.sys.contentType.sys.id;
          const fields = block.fields;
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
    return res.status(500).send("Error fetching Contentful data");
  }

  try {
    const inputDir = path.join(process.cwd(), "src");
    const outputDir = path.join(process.cwd(), "_tmp_preview"); // temporary output
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const elev = new Eleventy(inputDir, outputDir, {
      quietMode: true,
      passthroughFileCopy: true,
    });

    // Provide data via globalData override
    elev.setGlobalData({
      previewData: pageData,
    });

    // Render the "home.njk" template (or index.njk)
    const renderedHtml = await elev.renderTemplate("home.njk", pageData);

    return res.setHeader("Content-Type", "text/html").send(renderedHtml);
  } catch (err) {
    console.error("❌ Eleventy render error:", err.message);
    return res.status(500).send("Error rendering preview page");
  }
};
