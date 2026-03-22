export class KinesisVideoArchivedService {
  constructor(private accountId: string) {}

  getMediaForFragmentList(streamName: string, fragments: string[]): { contentType: string; payload: string } {
    return { contentType: "video/webm", payload: "" };
  }

  listFragments(streamName: string): any[] {
    return [{ FragmentNumber: "1", FragmentSizeInBytes: 1024, FragmentLengthInMilliseconds: 1000, ServerTimestamp: Date.now() / 1000, ProducerTimestamp: Date.now() / 1000 }];
  }

  getHLSStreamingSessionURL(streamName: string): string {
    return `https://kinesisvideo.us-east-1.amazonaws.com/hls/v1/getHLSMasterPlaylist.m3u8?SessionToken=mock-token`;
  }

  getDASHStreamingSessionURL(streamName: string): string {
    return `https://kinesisvideo.us-east-1.amazonaws.com/dash/v1/getDASHManifest.mpd?SessionToken=mock-token`;
  }
}
