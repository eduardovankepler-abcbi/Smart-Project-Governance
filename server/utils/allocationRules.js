function hasDuplicateAssignment(existingAssignments, { taskId, resourceId, excludeId = null }) {
  return existingAssignments.some((item) =>
    String(item.task_id) === String(taskId)
    && Number(item.resource_id || 0) === Number(resourceId || 0)
    && Number(item.id || 0) !== Number(excludeId || 0)
  );
}

module.exports = { hasDuplicateAssignment };
