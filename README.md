# DOJO Widgets of public interest
 
We have been working on dojo alot in MOCH and some of the result may
end up being of interest for others. As a start these two may be
useful to others.
 
 * dijit/WikiLabel
 * store/SqlStore

## WikiLabel

This is a dojo'ficatoin of the parser found at :

http://www.ivan.fomichev.name/2008/04/javascript-creole-10-wiki-markup-parser.html

This wrapping makes it wery easy to embbed Wiki into anything, even a
form, and all the rendering are done on the client.

It is possible to control where the wiki will fetch resources from and
how to form interlinks too.

## WebSQL store 

we looked at a while at the internet at found that noone have publiced
a dojo store that handle's WebSQL.

WebSQL are in a strange state, as it is unsuportted yet used in nearly
all mobile setups (for a good reason), at least via phonegab. So we
may like too use indexedDB in the future, but in the meantime this is
a nice alternertive.