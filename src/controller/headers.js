module.exports = (req, res) => {
  try {
    const data = {
      ipaddress: req.connection.remoteAddress,
      language: req.headers["accept-language"],
      software: req.headers["user-agent"],
    };

    return res.status(200).send(data);
  } catch (err) {
    return next({ status: 500, message: "server error" });
  }
};
