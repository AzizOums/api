const axios = require("axios");
const urlTools = require("../services/db/url");

const urlExists = async (url) => {
  try {
    const res = await axios.get(url);
    const { status } = res;
    if (status == 404) return false;
    return true;
  } catch (error) {
    return false;
  }
};

const redirectShortURL = async (req, res, next) => {
  try {
    const { param: shortURL } = req.params;
    const [{ URL }] = await urlTools.findByShortURL(shortURL);
    return res.status(308).redirect(URL);
  } catch (err) {
    console.log(err);
    return next({ status: 404, message: "Erreur: URL invalide !" });
  }
};

const postShortURL = async (req, res, next) => {
  const { url } = req.body;
  try {
    const exist = await urlExists(url);
    if (exist) {
      const test = await urlTools.exist(url);
      const [{ URL, shortURL }] = test
        ? await urlTools.findURL(url)
        : [await urlTools.addURL(url)];
      return res.status(200).send({
        url: URL,
        short: shortURL,
      });
    }
    return res.status(404).send({ Erreur: "L'url saisi n'existe pas" });
  } catch (err) {
    console.log(err);
    return next({ status: 500, message: "server error" });
  }
};

const getShortURL = (req, res, next) => {
  try {
    res.status(200).sendFile(__dirname + "/view/shorturl.html");
  } catch (err) {
    console.log(err);
    return next({ status: 500, message: "server error" });
  }
};

module.exports = {
  getShortURL,
  postShortURL,
  redirectShortURL,
};
