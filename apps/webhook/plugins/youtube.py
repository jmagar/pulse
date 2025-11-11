"""
YouTube plugin for fetching video transcripts.

This plugin extracts transcripts from YouTube videos and transforms
them into documents suitable for RAG indexing.
"""

import re
from typing import Any
from urllib.parse import parse_qs, urlparse

from api.schemas.indexing import IndexDocumentRequest
from plugins.base import BasePlugin
from utils.logging import get_logger

logger = get_logger(__name__)


class YouTubePlugin(BasePlugin):
    """
    Plugin for fetching YouTube video transcripts.
    
    Supports:
    - youtube.com/watch?v=VIDEO_ID
    - youtu.be/VIDEO_ID
    - youtube.com/embed/VIDEO_ID
    - youtube.com/v/VIDEO_ID
    """

    # Regex patterns for YouTube URLs
    YOUTUBE_PATTERNS = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/)([a-zA-Z0-9_-]{11})",
    ]

    def can_handle(self, url: str) -> bool:
        """
        Check if URL is a YouTube video.
        
        Args:
            url: URL to check
            
        Returns:
            True if URL matches YouTube video patterns
        """
        return self._extract_video_id(url) is not None

    def _extract_video_id(self, url: str) -> str | None:
        """
        Extract YouTube video ID from URL.
        
        Args:
            url: YouTube URL
            
        Returns:
            Video ID if found, None otherwise
        """
        # Try regex patterns first
        for pattern in self.YOUTUBE_PATTERNS:
            match = re.search(pattern, url)
            if match:
                return match.group(1)

        # Fallback: parse query parameters for watch URLs
        try:
            parsed = urlparse(url)
            if "youtube.com" in parsed.netloc:
                query_params = parse_qs(parsed.query)
                if "v" in query_params:
                    video_id = query_params["v"][0]
                    # Validate video ID format (11 alphanumeric chars)
                    if re.match(r"^[a-zA-Z0-9_-]{11}$", video_id):
                        return video_id
        except Exception:
            pass

        return None

    async def fetch_content(
        self,
        url: str,
        **kwargs: Any,
    ) -> IndexDocumentRequest:
        """
        Fetch YouTube video transcript and metadata.
        
        Args:
            url: YouTube video URL
            **kwargs: Additional options
                - languages: List of language codes to try (default: ['en'])
                - include_generated: Include auto-generated captions (default: True)
            
        Returns:
            IndexDocumentRequest with transcript as markdown
            
        Raises:
            ValueError: If video ID cannot be extracted
            Exception: If transcript fetching fails
        """
        video_id = self._extract_video_id(url)
        if not video_id:
            raise ValueError(f"Could not extract video ID from URL: {url}")

        logger.info(
            "Fetching YouTube transcript",
            url=url,
            video_id=video_id,
        )

        try:
            # Import here to make dependency optional
            from youtube_transcript_api import YouTubeTranscriptApi
            from youtube_transcript_api._errors import (
                NoTranscriptFound,
                TranscriptsDisabled,
                VideoUnavailable,
            )
        except ImportError:
            raise ImportError(
                "youtube-transcript-api is required for YouTube plugin. "
                "Install with: pip install youtube-transcript-api"
            )

        # Get language preferences
        languages = kwargs.get("languages", ["en"])
        include_generated = kwargs.get("include_generated", True)

        try:
            # Fetch transcript
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            
            # Try to find transcript in preferred languages
            transcript = None
            for lang in languages:
                try:
                    if include_generated:
                        transcript = transcript_list.find_transcript([lang])
                    else:
                        transcript = transcript_list.find_manually_created_transcript([lang])
                    break
                except NoTranscriptFound:
                    continue

            # If no preferred language found, try any available transcript
            if transcript is None:
                available = transcript_list._manually_created_transcripts
                if include_generated and not available:
                    available = transcript_list._generated_transcripts
                    
                if available:
                    transcript = list(available.values())[0]
                else:
                    raise NoTranscriptFound(
                        video_id,
                        languages,
                        transcript_list,
                    )

            # Fetch the actual transcript data
            transcript_data = transcript.fetch()
            
            # Format transcript as markdown
            markdown_lines = ["# YouTube Video Transcript\n"]
            markdown_lines.append(f"**Video ID:** {video_id}\n")
            markdown_lines.append(f"**URL:** {url}\n")
            markdown_lines.append(f"**Language:** {transcript.language}\n")
            markdown_lines.append(f"**Is Auto-Generated:** {transcript.is_generated}\n")
            markdown_lines.append("\n## Transcript\n")
            
            # Combine transcript segments
            for segment in transcript_data:
                text = segment["text"].strip()
                if text:
                    markdown_lines.append(f"{text}\n")

            full_transcript = "\n".join(markdown_lines)

            # Try to get video metadata (title, description)
            # Note: This requires additional API call which may need API key
            # For now, we'll use basic metadata
            title = f"YouTube Video {video_id}"
            description = f"Transcript from YouTube video: {url}"

            logger.info(
                "YouTube transcript fetched successfully",
                url=url,
                video_id=video_id,
                language=transcript.language,
                segments=len(transcript_data),
                is_generated=transcript.is_generated,
            )

            return IndexDocumentRequest(
                url=url,
                resolvedUrl=url,
                title=title,
                description=description,
                markdown=full_transcript,
                html="",  # No HTML for transcripts
                statusCode=200,
                gcsPath=None,
                screenshotUrl=None,
                language=transcript.language,
                country=None,
                isMobile=False,
            )

        except VideoUnavailable as e:
            logger.error(
                "YouTube video unavailable",
                url=url,
                video_id=video_id,
                error=str(e),
            )
            raise ValueError(f"Video is unavailable: {video_id}")

        except TranscriptsDisabled as e:
            logger.error(
                "YouTube transcripts disabled",
                url=url,
                video_id=video_id,
                error=str(e),
            )
            raise ValueError(f"Transcripts are disabled for video: {video_id}")

        except NoTranscriptFound as e:
            logger.error(
                "No YouTube transcript found",
                url=url,
                video_id=video_id,
                languages=languages,
                error=str(e),
            )
            raise ValueError(
                f"No transcript found for video {video_id} in languages: {languages}"
            )

        except Exception as e:
            logger.error(
                "Error fetching YouTube transcript",
                url=url,
                video_id=video_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            raise

    def get_priority(self) -> int:
        """
        Return high priority for YouTube URLs.
        
        Returns:
            Priority of 90 (high priority for specific source)
        """
        return 90

    def get_name(self) -> str:
        """
        Return plugin name.
        
        Returns:
            Plugin name
        """
        return "YouTube Transcript Plugin"

    def get_supported_patterns(self) -> list[str]:
        """
        Get supported URL patterns.
        
        Returns:
            List of supported YouTube URL patterns
        """
        return [
            "youtube.com/watch?v=*",
            "youtu.be/*",
            "youtube.com/embed/*",
            "youtube.com/v/*",
        ]

    async def health_check(self) -> bool:
        """
        Check if youtube-transcript-api is available.
        
        Returns:
            True if library is importable, False otherwise
        """
        try:
            import youtube_transcript_api
            return True
        except ImportError:
            logger.warning(
                "youtube-transcript-api not available",
                plugin=self.get_name(),
            )
            return False
