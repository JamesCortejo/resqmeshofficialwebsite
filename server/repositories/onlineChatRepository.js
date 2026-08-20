module.exports = {
  ...require('./onlineChat/departmentRepository'),
  ...require('./onlineChat/conversationRepository'),
  ...require('./onlineChat/messageRepository'),
  ...require('./onlineChat/readStateRepository'),
  ...require('./onlineChat/moderationRepository')
};
