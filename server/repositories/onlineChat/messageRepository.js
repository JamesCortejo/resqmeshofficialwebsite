const { run, get, all, transaction } = require('../../database/postgres');
const {
  selectMessageColumns,
  selectMessageColumnsWithFile,
  messageSenderJoins
} = require('./selectors');

function insertMessage(message) {
  return transaction(async (trx) => {
    const inserted = await trx.run(`
      INSERT INTO online_chat_messages (
        conversation_id,
        department_id,
        civilian_user_id,
        sender_type,
        sender_id,
        message_type,
        body,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      message.conversationId,
      message.departmentId,
      message.civilianUserId,
      message.senderType,
      message.senderId,
      message.messageType || 'text',
      message.body
    ]);

    if (message.voiceClip) {
      await trx.run(`
        INSERT INTO online_chat_message_voice_clips (
          message_id,
          file_path,
          mime_type,
          duration_seconds,
          size_bytes,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        inserted.lastID,
        message.voiceClip.filePath,
        message.voiceClip.mimeType,
        message.voiceClip.durationSeconds,
        message.voiceClip.sizeBytes
      ]);
    }

    await trx.run(`
      UPDATE online_chat_conversations
      SET
        last_message_id = ?,
        last_message_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [inserted.lastID, message.conversationId]);

    return trx.get(`
      SELECT
        ${selectMessageColumns('m')}
      FROM online_chat_messages m
      LEFT JOIN online_chat_message_voice_clips vc ON vc.message_id = m.id
      ${messageSenderJoins('m')}
      WHERE m.id = ?
      LIMIT 1
    `, [inserted.lastID]);
  });
}

function listMessages(conversationId, { beforeId = null, afterId = null, limit = 50 } = {}) {
  const params = [conversationId];
  let rangeClause = '';

  if (afterId) {
    rangeClause = 'AND m.id > ?';
    params.push(afterId);
  } else if (beforeId) {
    rangeClause = 'AND m.id < ?';
    params.push(beforeId);
  }

  params.push(limit);

  return all(`
    SELECT *
    FROM (
      SELECT
        ${selectMessageColumns('m')}
      FROM online_chat_messages m
      LEFT JOIN online_chat_message_voice_clips vc ON vc.message_id = m.id
      ${messageSenderJoins('m')}
      WHERE m.conversation_id = ? AND m.deleted = 0 ${rangeClause}
      ORDER BY m.id ${afterId ? 'ASC' : 'DESC'}
      LIMIT ?
    ) recent
    ORDER BY id ASC
  `, params);
}

function getMessageByIdWithVoice(id) {
  return get(`
    SELECT
      ${selectMessageColumnsWithFile('m')},
      d.slug AS "departmentSlug",
      d.name AS "departmentName",
      d.status AS "departmentStatus",
      d.rescuer_agency AS "departmentRescuerAgency",
      d.read_only AS "departmentReadOnly"
    FROM online_chat_messages m
    JOIN online_chat_departments d ON d.id = m.department_id
    LEFT JOIN online_chat_message_voice_clips vc ON vc.message_id = m.id
    ${messageSenderJoins('m')}
    WHERE m.id = ? AND m.deleted = 0
    LIMIT 1
  `, [id]);
}

function listGlobalMessages(departmentId, { beforeId = null, afterId = null, limit = 50 } = {}) {
  const params = [departmentId];
  let rangeClause = '';

  if (afterId) {
    rangeClause = 'AND gm.id > ?';
    params.push(afterId);
  } else if (beforeId) {
    rangeClause = 'AND gm.id < ?';
    params.push(beforeId);
  }

  params.push(limit);

  return all(`
    SELECT *
    FROM (
      SELECT
        gm.id,
        gm.department_id AS "departmentId",
        gm.sender_type AS "senderType",
        gm.sender_id AS "senderId",
        gm.body,
        gm.deleted,
        gm.created_at AS "createdAt",
        gm.updated_at AS "updatedAt",
        admin_sender.first_name_enc AS "adminSenderFirstNameEnc",
        admin_sender.middle_name_enc AS "adminSenderMiddleNameEnc",
        admin_sender.last_name_enc AS "adminSenderLastNameEnc"
      FROM online_chat_global_messages gm
      LEFT JOIN users admin_sender ON admin_sender.id = gm.sender_id AND gm.sender_type = 'admin'
      WHERE gm.department_id = ? AND gm.deleted = 0 ${rangeClause}
      ORDER BY gm.id ${afterId ? 'ASC' : 'DESC'}
      LIMIT ?
    ) recent
    ORDER BY id ASC
  `, params);
}

function insertGlobalMessage(message) {
  return run(`
    INSERT INTO online_chat_global_messages (
      department_id,
      sender_type,
      sender_id,
      body,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `, [
    message.departmentId,
    message.senderType,
    message.senderId,
    message.body
  ]);
}

function getGlobalMessageById(id) {
  return get(`
    SELECT
      id,
      department_id AS departmentId,
      sender_type AS senderType,
      sender_id AS senderId,
      body,
      deleted,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM online_chat_global_messages
    WHERE id = ?
    LIMIT 1
  `, [id]);
}

module.exports = {
  getGlobalMessageById,
  getMessageByIdWithVoice,
  insertGlobalMessage,
  insertMessage,
  listGlobalMessages,
  listMessages
};
