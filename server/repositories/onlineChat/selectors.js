function selectDepartmentColumns(prefix = 'd') {
  return `
    ${prefix}.id,
    ${prefix}.slug,
    ${prefix}.name,
    ${prefix}.subtitle,
    ${prefix}.status,
    ${prefix}.color_tag AS colorTag,
    ${prefix}.rescuer_agency AS rescuerAgency,
    ${prefix}.icon_url AS iconUrl,
    ${prefix}.sort_order AS sortOrder,
    ${prefix}.read_only AS readOnly,
    ${prefix}.archived_at AS archivedAt,
    ${prefix}.created_at AS createdAt,
    ${prefix}.updated_at AS updatedAt
  `;
}

function selectMessageColumns(prefix = 'm') {
  return `
    ${prefix}.id,
    ${prefix}.conversation_id AS "conversationId",
    ${prefix}.department_id AS "departmentId",
    ${prefix}.civilian_user_id AS "civilianUserId",
    ${prefix}.sender_type AS "senderType",
    ${prefix}.sender_id AS "senderId",
    ${prefix}.message_type AS "messageType",
    ${prefix}.body,
    ${prefix}.deleted,
    ${prefix}.created_at AS "createdAt",
    ${prefix}.updated_at AS "updatedAt",
    vc.id AS "voiceClipId",
    vc.mime_type AS "voiceMimeType",
    vc.duration_seconds AS "voiceDurationSeconds",
    vc.size_bytes AS "voiceSizeBytes",
    civilian_sender.first_name_enc AS "civilianSenderFirstNameEnc",
    civilian_sender.middle_name_enc AS "civilianSenderMiddleNameEnc",
    civilian_sender.last_name_enc AS "civilianSenderLastNameEnc",
    admin_sender.first_name_enc AS "adminSenderFirstNameEnc",
    admin_sender.middle_name_enc AS "adminSenderMiddleNameEnc",
    admin_sender.last_name_enc AS "adminSenderLastNameEnc",
    rescuer_sender.first_name_enc AS "rescuerSenderFirstNameEnc",
    rescuer_sender.middle_name_enc AS "rescuerSenderMiddleNameEnc",
    rescuer_sender.last_name_enc AS "rescuerSenderLastNameEnc"
  `;
}

function selectMessageColumnsWithFile(prefix = 'm') {
  return `
    ${selectMessageColumns(prefix)},
    vc.file_path AS "voiceFilePath"
  `;
}

function messageSenderJoins(prefix = 'm') {
  return `
    LEFT JOIN users civilian_sender ON civilian_sender.id = ${prefix}.sender_id AND ${prefix}.sender_type = 'civilian'
    LEFT JOIN users admin_sender ON admin_sender.id = ${prefix}.sender_id AND ${prefix}.sender_type = 'admin'
    LEFT JOIN rescuers rescuer_sender ON rescuer_sender.id = ${prefix}.sender_id AND ${prefix}.sender_type = 'rescuer'
  `;
}

module.exports = {
  selectDepartmentColumns,
  selectMessageColumns,
  selectMessageColumnsWithFile,
  messageSenderJoins
};
