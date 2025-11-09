from collections.abc import Sequence

class BM25Okapi:
    def __init__(self, corpus: Sequence[Sequence[str]], *, k1: float = ..., b: float = ...) -> None: ...

    def get_scores(self, query: Sequence[str]) -> Sequence[float]: ...

    def get_top_n(
        self,
        query: Sequence[str],
        documents: Sequence[str],
        n: int = ...,
    ) -> list[str]: ...
