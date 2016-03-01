# Sandstorm administrator's guide

This guide provides an overview of essential topics you'll need to know to make productive use of
your own Sandstorm self-install.

## Customizing Sandstorm for your users

See these topics elsewhere in the docs:

- [Developing new apps for your Sandstorm server](../developing.md)

- [Creating a custom page at the root of your Sandstorm server](faq.md#can-i-customize-the-root-page-of-my-sandstorm-install)

- [Serving static content on domain names controlled by your users](../developing/web-publishing.md)

- [Enabling HTTPS/SSL](ssl.md)

## File locations & service management

By default, Sandstorm installs within **/opt/sandstorm**.

- Now is a good time to `cd /opt/sandstorm` and use `ls` take a look around!

**Note:** If you are having trouble finding `/opt/sandstorm`, it could be because you need to `vagrant
vm ssh` into the virtual machine that runs Sandstorm for you.

The [install script](https://github.com/sandstorm-io/sandstorm/tree/master/install.sh) creates a system
service to run Sandstorm, by default.

- To start Sandstorm, run: `sudo service sandstorm start` or `sudo systemctl start sandstorm`
  (depending on your Linux distribution).

- To stop or restart Sandstorm, replace `start` with `stop` or `restart` in the above command.

Within `/opt/sandstorm` there are a few essential files and directories.

- `/opt/sandstorm/sandstorm.conf` - this is the Sandstorm configuration file. We sometimes refer to
  this as `sandstorm.conf` for short. Edit it by running `sudo nano /opt/sandstorm/sandstorm.conf`;
  after editing it, restart Sandstorm.

- `/opt/sandstorm/var/log/sandstorm.log` - this is the log file for Sandstorm. If you are logged in
  to a Sandstorm install as an administrator, you can view this on the web by visiting **Admin
  Settings** then clicking **Log**.

- `/opt/sandstorm/var/mongo` - this is the data directory for MongoDB, the database engine that
  stores all Sandstorm data like grain names, user names, and permissions. You can query it by
  starting a Mongo shell by running: `sudo sandstorm mongo`.

- `/opt/sandstorm/var/sandstorm/grains` - this directory contains the files and directories created
  by each app instance, which we call a grain.

- `/opt/sandstorm/var/sandstorm/grains/{{grainId}}/sandbox` - this directory is available within the
  grain as `/var`, via a filesystem namespace.

- `/opt/sandstorm/var/sandcats` - this directory contains configuration information for the
  [sandcats.io dynamic DNS service](sandcats.md).

- `/opt/sandstorm/sandstorm-{{versionNumber}}` - this directory contains Sandstorm and all its
  dependencies. To install your own modified version, read our instructions on [building Sandstorm
  from source](../install.md#option-4-installing-from-source).

## New versions and applying updates

### Sandstorm itself

We release new versions of Sandstorm approximately once per week. We release them to
[dl.sandstorm.io](https://dl.sandstorm.io/) as `tar.xz` files.  Since they contain not just
Sandstorm but all of Sandstorm's dependencies, we call them the **Sandstorm bundle.**

Since September 2015, we [sign updates and Sandstorm verifies these
signatures](https://blog.sandstorm.io/news/2015-09-24-is-curl-bash-insecure-pgp-verified-install.html).
By default, Sandstorm checks for updates every day. You can configure this behavior by editing `sandstorm.conf`.

This setting enables automatic updates.

```
UPDATE_CHANNEL=dev
```

This setting disables it.

```
UPDATE_CHANNEL=none
```

We intend to follow the Chrome update channels system, but for now we only have a `dev` channel.

We strongly recommend that you keep automatic updates enabled. If you want to disable it, please
email support@sandstorm.io so we can work with you to stay up to date some other way. We intend for
our automatic updates to not cause any downtime.

### Sandstorm apps

Sandstorm apps are distributed as **SPK** files. They contain contain a Linux web app and all its
dependencies, as well as metadata like the app version and author name. The SPK file format is
defined using Cap'n Proto as
[package.capnp](https://github.com/sandstorm-io/sandstorm/blob/master/src/sandstorm/package.capnp)
and you can use the `spk` command line tool to analyze a package.

Sandstorm.io, the organization, maintains a list of packages in an [app
market](https://apps.sandstorm.io/). The app market publishes metadata about what apps are
available, called the **app index.** Every day, Sandstorm downloads this file. For every app in the
app index, if a user on your Sandstorm server has an older version installed, Sandstorm creates a
notification suggesting that the user click a button to update to the latest version.

This behavior can be customized within **Admin Settings** under **Advanced**. We strongly recommend
keeping this enabled. You can also point your Sandstorm install at a different app market URL and
app index URL.

## Hostnames and wildcards

In `sandstorm.conf`, the `BASE_URL` specifies the URL at which your Sandstorm install assumes it is
available. For example, it might be:

```
BASE_URL=http://sandstorm.example.com
```

Sandstorm requires a [wildcard DNS record](https://en.wikipedia.org/wiki/Wildcard_DNS_record). Each
session to each grain uses a unique, one-time-use hostname; Sandstorm uses this as [part of its
security model](wildcard.md) and this requirement cannot be disabled.

Typically, people configure a wildcard record at `*.sandstorm.example.com`. The `WILDCARD_HOST` can
point at a different wildcard within the same domain name, but note that the `BASE_URL` and
`WILDCARD_HOST` must be within the same domain name. Therefore, the following can work as well:

```
BASE_URL=http://sandstorm.example.com
WILDCARD_HOST=ss-*.example.com
```

This would cause Sandstorm to create hostnames of the form `ss-foobar.example.com` and assumes that `*.example.com` is set up as a wildcard record. In BIND syntax, that would be the following.

```
*.example.com. 3600 IN A 0.0.0.0
```

**Note** that any port number that appears in `BASE_URL` must also appear in `WILDCARD_HOST`.

**For SSL/HTTPS,** you will also need a wildcard certificate. Read more about [Sandstorm and HTTPS](ssl.md).

## Accounts, authentication, and access control

Key concepts:

- A Sandstorm grain is owned by the person who created it.

- Every Sandstorm user sees only the grains they have created or the grains that have been shared with them.

- Every Sandstorm user starts by seeing no apps installed, and must install apps on their own.

- Sandstorm supports multiple **login providers** which be enabled/disabled from **Admin Settings**.

There are three levels of users.

- **Guest** users can see grains that have been shared with them. By default, anyone can click
  **Sign in** and become a guest user.

- **Invited users** can install apps for their own use, create grains, and share them.

- **Admin users** can also see the **Admin Settings** control panel, allowing them to change a user
  between these user levels. They can also invite users via the **Admin Settings** control panel.

If you see a message saying your Sandstorm install has no users, read the [How do I log in, if
there's a problem with logging in via the
web?](faq.md#how-do-i-log-in-if-theres-a-problem-with-logging-in-via-the-web) frequently-asked
question.
