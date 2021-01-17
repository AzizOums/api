const getFile = (req, res, next) => {
  try {
    res.status(200).sendFile(__dirname + "/view/fileMetadata.html");
  } catch (err) {
    console.log(err);
    return next({ status: 500, message: "server error" });
  }
};

const postFile = (req, res, next) => {
  try {
    if (req.files === null) return res.status(400).send("no file uploaded");
    const { name, size, mimetype } = req.files.upfile;
    return res.status(200).send({
      name: name,
      type: mimetype,
      size: size,
    });
  } catch (err) {
    console.log(err);
    return next({ status: 500, message: "server error" });
  }
};

module.exports = {
  getFile,
  postFile,
};
