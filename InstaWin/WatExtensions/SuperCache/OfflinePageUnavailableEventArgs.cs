namespace WatExtensions.SuperCache
{
    using System;

    public sealed class OfflinePageUnavailableEventArgs
    {
        public OfflinePageUnavailableEventArgs(Uri requestUri)
        {
            this.RequestUri = requestUri;
        }

        public Uri RequestUri { get; private set; }
    }
}
