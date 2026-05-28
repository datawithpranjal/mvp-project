from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
import json
import re

import duckdb

from app.schemas.scenario import TablePreview
from app.schemas.validation import QueryResult

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$")
TIMESTAMPTZ_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\+\d{2}:\d{2}|-\d{2}:\d{2}|Z)$"
)


class DuckDBRunner:
    def connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(database=":memory:")

    def prepare_connection(self, setup_sql: str) -> duckdb.DuckDBPyConnection:
        connection = self.connect()
        self.execute_script(connection, setup_sql)
        return connection

    def prepare_connection_from_tables(
        self, tables: list[TablePreview]
    ) -> duckdb.DuckDBPyConnection:
        connection = self.connect()
        for table in tables:
            self.create_table(connection, table)
        return connection

    def execute_script(self, connection: duckdb.DuckDBPyConnection, script: str) -> None:
        for statement in self._split_script(script):
            connection.execute(statement)

    def create_table(self, connection: duckdb.DuckDBPyConnection, table: TablePreview) -> None:
        column_definitions = []
        for index, column_name in enumerate(table.columns):
            column_values = [row[index] for row in table.rows if index < len(row)]
            column_type = self._infer_column_type(column_values)
            column_definitions.append(f'{self._quote_identifier(column_name)} {column_type}')

        create_table_sql = (
            f"CREATE TABLE {self._quote_identifier(table.name)} "
            f"({', '.join(column_definitions)})"
        )
        connection.execute(create_table_sql)

        if not table.rows:
            return

        placeholders = ", ".join(["?"] * len(table.columns))
        insert_sql = (
            f"INSERT INTO {self._quote_identifier(table.name)} VALUES ({placeholders})"
        )
        connection.executemany(insert_sql, table.rows)

    def execute_query(self, connection: duckdb.DuckDBPyConnection, sql: str) -> QueryResult:
        normalized_sql = self.normalize_query(sql)
        cursor = connection.execute(normalized_sql)
        description = cursor.description or []
        columns = [column[0] for column in description]
        column_types = [str(column[1]) for column in description]
        rows = [self._serialize_row(row) for row in cursor.fetchall()]
        sorted_rows = sorted(rows, key=self._sort_key)
        return QueryResult(columns=columns, column_types=column_types, rows=sorted_rows)

    def preview_table(self, connection: duckdb.DuckDBPyConnection, table_name: str) -> TablePreview:
        result = self.execute_query(connection, f"SELECT * FROM {table_name}")
        return TablePreview(name=table_name, columns=result.columns, rows=result.rows)

    def results_match(self, actual: QueryResult, expected: QueryResult) -> bool:
        return (
            actual.columns == expected.columns
            and actual.column_types == expected.column_types
            and actual.rows == expected.rows
        )

    def normalize_query(self, sql: str) -> str:
        stripped = sql.strip()
        if stripped.endswith(";"):
            stripped = stripped[:-1].rstrip()
        return stripped

    def _split_script(self, script: str) -> list[str]:
        return [statement.strip() for statement in script.split(";") if statement.strip()]

    def _serialize_row(self, row: tuple[Any, ...]) -> list[Any]:
        return [self._serialize_value(value) for value in row]

    def _serialize_value(self, value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat(sep=" ")
        if isinstance(value, (date, time)):
            return value.isoformat()
        if isinstance(value, Decimal):
            return float(value)
        return value

    def _sort_key(self, row: list[Any]) -> tuple[str, ...]:
        return tuple(json.dumps(value, default=str, sort_keys=True) for value in row)

    def _quote_identifier(self, identifier: str) -> str:
        return '"' + identifier.replace('"', '""') + '"'

    def _infer_column_type(self, values: list[Any]) -> str:
        non_null_values = [value for value in values if value is not None]
        if not non_null_values:
            return "VARCHAR"

        if all(isinstance(value, bool) for value in non_null_values):
            return "BOOLEAN"
        if all(isinstance(value, int) and not isinstance(value, bool) for value in non_null_values):
            return "BIGINT"
        if all(
            isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)
            for value in non_null_values
        ):
            return "DOUBLE"
        if all(isinstance(value, str) and DATE_PATTERN.match(value) for value in non_null_values):
            return "DATE"
        if all(
            isinstance(value, str) and TIMESTAMPTZ_PATTERN.match(value)
            for value in non_null_values
        ):
            return "TIMESTAMPTZ"
        if all(
            isinstance(value, str) and TIMESTAMP_PATTERN.match(value)
            for value in non_null_values
        ):
            return "TIMESTAMP"

        return "VARCHAR"
