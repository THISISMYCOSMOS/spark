from app.config import Settings


def test_render_postgres_url_uses_psycopg_driver() -> None:
    settings = Settings(
        database_url="postgresql://spark:secret@database:5432/spark_kw"
    )

    assert (
        settings.database_url
        == "postgresql+psycopg://spark:secret@database:5432/spark_kw"
    )


def test_explicit_sqlalchemy_driver_is_preserved() -> None:
    database_url = "postgresql+psycopg://spark:secret@database:5432/spark_kw"

    assert Settings(database_url=database_url).database_url == database_url
