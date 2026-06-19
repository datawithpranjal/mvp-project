# Database Schema Notes

The current architecture uses file-backed scenario content, guest progress storage, and FastAPI/Postgres for authentication, access, and account data where configured.

When progress moves server-side, use these tables as the starting point.

## profiles

- `id`
- `full_name`
- `email`
- `role_stage`
- `target_goal`
- `daily_time`
- `timeline`
- `is_premium`
- `created_at`
- `updated_at`

## scenarios

- `id`
- `title`
- `slug`
- `topic`
- `difficulty`
- `is_premium`
- `is_published`
- `estimated_minutes`
- `short_description`
- `problem_statement`
- `context`
- `expected_root_causes`
- `expected_solution_design`
- `expected_tradeoffs`
- `expected_monitoring`
- `follow_up_questions`
- `model_answer`
- `tags`
- `sort_order`
- `created_at`
- `updated_at`

## scenario_attempts

- `id`
- `user_id`
- `scenario_id`
- `answer_text`
- `ai_score`
- `ai_feedback_json`
- `self_rating`
- `status`
- `completed_at`
- `created_at`
- `updated_at`

## learning_paths

- `id`
- `name`
- `slug`
- `description`
- `duration_days`
- `target_user`
- `is_active`

## learning_path_steps

- `id`
- `path_id`
- `day_number`
- `title`
- `description`
- `task_type`
- `related_scenario_id`
- `related_module_id`
- `sort_order`

## user_path_progress

- `id`
- `user_id`
- `path_id`
- `current_day`
- `completed_steps`
- `started_at`
- `updated_at`

## user_stats

- `user_id`
- `xp`
- `streak_count`
- `last_practice_date`
- `readiness_score`
- `weak_areas_json`
- `updated_at`
