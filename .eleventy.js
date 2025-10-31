module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/style.css"); // copy styles to _site
  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "md", "html", "11ty.js", "txt"],
    passthroughFileCopy: true
  };
};
