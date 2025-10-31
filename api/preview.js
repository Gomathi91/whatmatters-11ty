require("dotenv").config();
const contentful = require("contentful");
const nunjucks = require("nunjucks");
const path = require("path");

const PREVIEW_SECRET = process.env.CONTENTFUL_PREVIEW_SECRET;
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const PREVIEW_ACCESS_TOKEN = process.env.CONTENTFUL_PREVIEW_TOKEN;
const ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";

// Point Nunjucks to your Eleventy src folder
const njkEnv = nunjucks.configure(path.join(process.cwd(), "src"), {
  autoescape: true,
});

module.exports = async function (req, res) {
  const { secret, slug } = req.query;

  if (!secret || secret !== PREVIEW_SECRET) {
    return res.status(401).send("Invalid preview secret");
  }

  const client = contentful.createClient({
    space: SPACE_ID,
    accessToken: PREVIEW_ACCESS_TOKEN,
    environment: ENVIRONMENT,
    host: "preview.contentful.com",
  });

  let pageData;
  try {
    const { items, includes = {} } = await client.getEntries({
      content_type: "deluxePage",
      "fields.slug": slug,
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
              return { id: block.sys.id, type, title: fields.title, content: fields.content, image: getImageUrl(fields.image) };
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
    // Map slug to template
    let templateFile = slug === "home" ? "index.njk" : `${slug}.njk`;

    // Render the template with pageData under variable "home" (to keep your template code consistent)
    const html = njkEnv.render(templateFile, { home: pageData });
    return res.setHeader("Content-Type", "text/html").send(html);
  } catch (err) {
    console.error("❌ Nunjucks render error:", err.message);
    return res.status(500).send("Error rendering preview page");
  }
};
