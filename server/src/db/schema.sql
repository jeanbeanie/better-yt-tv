\restrict dbmate

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg13+1)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: billing_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_customers (
    user_id uuid NOT NULL,
    stripe_customer_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: channel_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_preferences (
    user_id uuid NOT NULL,
    channel_id text NOT NULL,
    enabled_all boolean DEFAULT true NOT NULL,
    enabled_live boolean DEFAULT true NOT NULL,
    excluded_shorts boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: channel_recent_cache_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_recent_cache_state (
    channel_id text NOT NULL,
    cache_expires_at timestamp with time zone NOT NULL,
    last_checked_at timestamp with time zone DEFAULT now() NOT NULL,
    uploads_playlist_id text
);


--
-- Name: entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entitlements (
    user_id uuid NOT NULL,
    feature_key text NOT NULL,
    source text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: list_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.list_channels (
    list_id uuid NOT NULL,
    channel_id text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_tokens (
    user_id uuid NOT NULL,
    refresh_token_ciphertext text NOT NULL,
    access_token text,
    expires_at timestamp with time zone,
    scopes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_meta (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    user_id uuid NOT NULL,
    channel_id text NOT NULL,
    channel_title text NOT NULL,
    channel_thumb_url text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_video_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_video_state (
    user_id uuid NOT NULL,
    video_id text NOT NULL,
    watched_at timestamp with time zone,
    source text DEFAULT 'manual'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_video_state_source_check CHECK ((source = ANY (ARRAY['ended'::text, 'manual'::text, 'reset'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    google_sub text NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: videos_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.videos_cache (
    video_id text NOT NULL,
    channel_id text NOT NULL,
    title text NOT NULL,
    published_at timestamp with time zone NOT NULL,
    duration_seconds integer,
    thumb_url text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: youtube_quota_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.youtube_quota_usage (
    id bigint NOT NULL,
    call_type text NOT NULL,
    units integer NOT NULL,
    called_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: youtube_quota_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.youtube_quota_usage ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.youtube_quota_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: billing_customers billing_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_pkey PRIMARY KEY (user_id);


--
-- Name: billing_customers billing_customers_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: channel_preferences channel_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_preferences
    ADD CONSTRAINT channel_preferences_pkey PRIMARY KEY (user_id, channel_id);


--
-- Name: channel_recent_cache_state channel_recent_cache_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_recent_cache_state
    ADD CONSTRAINT channel_recent_cache_state_pkey PRIMARY KEY (channel_id);


--
-- Name: entitlements entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_pkey PRIMARY KEY (user_id, feature_key);


--
-- Name: list_channels list_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_channels
    ADD CONSTRAINT list_channels_pkey PRIMARY KEY (list_id, channel_id);


--
-- Name: lists lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_pkey PRIMARY KEY (id);


--
-- Name: lists lists_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_user_id_name_key UNIQUE (user_id, name);


--
-- Name: oauth_tokens oauth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_tokens
    ADD CONSTRAINT oauth_tokens_pkey PRIMARY KEY (user_id);


--
-- Name: schema_meta schema_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_meta
    ADD CONSTRAINT schema_meta_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (user_id, channel_id);


--
-- Name: user_video_state user_video_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_video_state
    ADD CONSTRAINT user_video_state_pkey PRIMARY KEY (user_id, video_id);


--
-- Name: users users_google_sub_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: videos_cache videos_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.videos_cache
    ADD CONSTRAINT videos_cache_pkey PRIMARY KEY (video_id);


--
-- Name: youtube_quota_usage youtube_quota_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.youtube_quota_usage
    ADD CONSTRAINT youtube_quota_usage_pkey PRIMARY KEY (id);


--
-- Name: channel_preferences_user_enabled_all_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channel_preferences_user_enabled_all_idx ON public.channel_preferences USING btree (user_id, enabled_all);


--
-- Name: lists_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lists_user_id_idx ON public.lists USING btree (user_id);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: user_subscriptions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_subscriptions_user_id_idx ON public.user_subscriptions USING btree (user_id);


--
-- Name: user_video_state_user_watched_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_video_state_user_watched_idx ON public.user_video_state USING btree (user_id, watched_at);


--
-- Name: videos_cache_channel_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX videos_cache_channel_published_idx ON public.videos_cache USING btree (channel_id, published_at DESC);


--
-- Name: youtube_quota_usage_called_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX youtube_quota_usage_called_at_idx ON public.youtube_quota_usage USING btree (called_at);


--
-- Name: youtube_quota_usage_usage_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX youtube_quota_usage_usage_date_idx ON public.youtube_quota_usage USING btree (((timezone('America/Los_Angeles'::text, called_at))::date));


--
-- Name: billing_customers billing_customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channel_preferences channel_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_preferences
    ADD CONSTRAINT channel_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: entitlements entitlements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: list_channels list_channels_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.list_channels
    ADD CONSTRAINT list_channels_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lists(id) ON DELETE CASCADE;


--
-- Name: lists lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lists
    ADD CONSTRAINT lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: oauth_tokens oauth_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_tokens
    ADD CONSTRAINT oauth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_video_state user_video_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_video_state
    ADD CONSTRAINT user_video_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20260517051252'),
    ('20260517192315'),
    ('20260521154720'),
    ('20260804175339'),
    ('20260817030003'),
    ('20260817190121'),
    ('20260818234304');
