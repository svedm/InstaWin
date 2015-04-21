namespace WatExtensions.SuperCache
{
    using System;

    public sealed class ResponseReceivedEventArgs
    {
        public ResponseReceivedEventArgs()
        {
        }

        public ResponseReceivedEventArgs(Uri requestUri, string contentType, string content)
        {
            this.RequestUri = requestUri;
            this.ContentType = contentType;
            this.Content = content;
        }

        public Uri RequestUri { get; private set; }

        public string ContentType { get; private set; }

        public string Content { get; set; }
    }
}
