"""Владение кейсами, публичные снимки и демонстрационные сессии."""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("owner_id", sa.String(36), nullable=False, server_default="business-demo"))
    op.add_column("tasks", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tasks", sa.Column("published_snapshot", sa.JSON(), nullable=True))
    op.create_index("ix_tasks_owner_id", "tasks", ["owner_id"])
    op.create_table(
        "user_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("profile_id", sa.String(36), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    tasks = sa.table("tasks", sa.column("id", sa.String()), sa.column("is_published", sa.Boolean()),
                     sa.column("card", sa.JSON()), sa.column("readiness", sa.JSON()),
                     sa.column("description", sa.Text()), sa.column("topic", sa.String()),
                     sa.column("published_snapshot", sa.JSON()))
    connection = op.get_bind()
    for row in connection.execute(sa.select(tasks).where(tasks.c.is_published.is_(True))).mappings().all():
        snapshot = {key: row[key] for key in ("card", "readiness", "description", "topic")}
        connection.execute(tasks.update().where(tasks.c.id == row["id"]).values(published_snapshot=snapshot))


def downgrade() -> None:
    op.drop_table("user_sessions")
    op.drop_index("ix_tasks_owner_id", table_name="tasks")
    op.drop_column("tasks", "published_snapshot")
    op.drop_column("tasks", "is_deleted")
    op.drop_column("tasks", "owner_id")
